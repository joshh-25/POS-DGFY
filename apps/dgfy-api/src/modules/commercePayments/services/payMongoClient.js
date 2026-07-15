import crypto from 'crypto';
import {
    PAYMONGO_API_BASE_URL,
    PAYMONGO_SECRET_KEY,
    PAYMONGO_WEBHOOK_SECRET,
    PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
} from '../../../config/env.js';

// payMongoClient.js — Phase 10 Plan 05 Task 1 (D-01).
//
// Native-`fetch` PayMongo client re-implementing the QR Ph 3-call dance
// (createPaymentIntent -> createPaymentMethod -> attachPaymentIntent) and
// raw-body webhook signature verification from
// backend/src/services/paymongoService.js (READ-ONLY reference; never
// imported — apps/dgfy-api never imports backend/ code). Zero new packages:
// apps/dgfy-api has no axios, so this uses Node's global `fetch` + `crypto`.
//
// D-02 split excision: createPaymentIntent's attributes literally omit
// `split_payment`. Re-adding split later is a provider-side arg on the same
// call — no schema migration needed (D-02 "keep adjustable").
//
// This module owns ONLY the PayMongo HTTP surface + signature verification.
// It never touches Sequelize/the database — session persistence is
// ../repositories/commercePaymentRepository.js's concern, wired together by
// ../usecases/createQrphSessionUseCases.js.

/** Default QR Ph expiry fallback (matches legacy `store/usecases/storeUseCases.js:2504`). */
const DEFAULT_EXPIRY_FALLBACK_MS = 30 * 60 * 1000;

/**
 * Thrown for any non-2xx PayMongo API response. Carries the provider's own
 * error payload (never swallowed) so callers/logs retain the real reason.
 */
export class PayMongoError extends Error {
    constructor(message, { statusCode = 502, providerError = null } = {}) {
        super(message);
        this.name = 'PayMongoError';
        this.statusCode = statusCode;
        this.providerError = providerError;
    }
}

/**
 * Thrown when PayMongo is not configured (missing secret key). Duck-typed
 * on `.name` by createQrphSessionUseCases.js and mapped to a 503
 * DomainError — never surfaced as a raw 500 or a broken/partial session.
 */
export class PayMongoServiceUnavailableError extends Error {
    constructor(message, { missing = [] } = {}) {
        super(message);
        this.name = 'PayMongoServiceUnavailableError';
        this.statusCode = 503;
        this.missing = missing;
    }
}

const buildAuthHeader = (secretKey) => ({
    Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
    'Content-Type': 'application/json'
});

/**
 * POSTs a `{ data: { attributes } }` envelope to PayMongo and returns
 * `body.data` on success. Non-2xx responses are mapped to a typed
 * PayMongoError carrying the provider's own error body.
 */
async function postJson({ baseUrl, secretKey, path, attributes }) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: buildAuthHeader(secretKey),
        body: JSON.stringify({ data: { attributes } })
    });

    let body;
    try {
        body = await response.json();
    } catch {
        body = null;
    }

    if (!response.ok) {
        const providerError = body?.errors?.[0] || body || { detail: `HTTP ${response.status}` };
        throw new PayMongoError(
            providerError.detail || providerError.message || `PayMongo request failed with status ${response.status}`,
            { statusCode: response.status, providerError }
        );
    }

    return body?.data || null;
}

/**
 * Builds a PayMongo client closed over resolved config. Every option
 * defaults to the corresponding config/env.js export so production code
 * never has to pass config explicitly; tests inject overrides (mock
 * `fetch`, a fixed `secretKey`/`webhookSecret`) without touching env vars.
 *
 * @param {{baseUrl?: string, secretKey?: string, webhookSecret?: string, webhookTimestampToleranceSeconds?: number}} [config]
 * @returns {{createQrphPaymentIntent: Function, verifyWebhookSignature: Function}}
 */
export function buildPayMongoClient({
    baseUrl = PAYMONGO_API_BASE_URL,
    secretKey = PAYMONGO_SECRET_KEY,
    webhookSecret = PAYMONGO_WEBHOOK_SECRET,
    webhookTimestampToleranceSeconds = PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
} = {}) {
    /** Step 1 of 3: create the Payment Intent. NO `split_payment` (D-02). */
    async function createPaymentIntent({ amount, currency = 'PHP', description, metadata = {} }) {
        return postJson({
            baseUrl,
            secretKey,
            path: '/payment_intents',
            attributes: {
                amount,
                currency,
                description,
                payment_method_allowed: ['qrph'],
                metadata
            }
        });
    }

    /** Step 2 of 3: create the QR Ph payment method. */
    async function createPaymentMethod({ type = 'qrph', billing = {}, metadata = {} }) {
        return postJson({
            baseUrl,
            secretKey,
            path: '/payment_methods',
            attributes: { type, billing, metadata }
        });
    }

    /** Step 3 of 3: attach the payment method to the intent (generates the QR). */
    async function attachPaymentIntent({ paymentIntentId, paymentMethodId, returnUrl = null }) {
        const attributes = { payment_method: paymentMethodId };
        if (returnUrl) attributes.return_url = returnUrl;
        return postJson({
            baseUrl,
            secretKey,
            path: `/payment_intents/${paymentIntentId}/attach`,
            attributes
        });
    }

    /**
     * Runs the full QR Ph 3-call dance and returns the shape the usecase
     * layer persists. Throws PayMongoServiceUnavailableError (never
     * attempts the HTTP calls) when the secret key is not configured —
     * the controller maps this to 503 rather than creating a broken
     * session (must_haves truth #4).
     *
     * @param {{amount, currency?, description?, billing?, metadata?, returnUrl?}} params
     * @returns {Promise<{paymentIntentId: string, paymentMethodId: string, qrCodeImageUrl: string|null, expiresAt: Date}>}
     */
    async function createQrphPaymentIntent({
        amount,
        currency = 'PHP',
        description,
        billing = {},
        metadata = {},
        returnUrl = null
    }) {
        if (!secretKey) {
            throw new PayMongoServiceUnavailableError(
                'PayMongo is not configured (missing secret key).',
                { missing: ['PAYMONGO_SECRET_KEY'] }
            );
        }

        const paymentIntent = await createPaymentIntent({ amount, currency, description, metadata });
        const paymentMethod = await createPaymentMethod({ type: 'qrph', billing, metadata });
        const attachedIntent = await attachPaymentIntent({
            paymentIntentId: paymentIntent.id,
            paymentMethodId: paymentMethod.id,
            returnUrl
        });

        const nextAction = attachedIntent?.attributes?.next_action || {};
        const code = nextAction?.code || {};
        const rawExpiresAt = code?.expires_at ?? nextAction?.expires_at ?? attachedIntent?.attributes?.expires_at ?? null;
        const expiresAt = rawExpiresAt ? new Date(rawExpiresAt) : new Date(Date.now() + DEFAULT_EXPIRY_FALLBACK_MS);

        return {
            paymentIntentId: paymentIntent.id,
            paymentMethodId: paymentMethod.id,
            qrCodeImageUrl: code?.image_url ?? code?.imageUrl ?? null,
            expiresAt
        };
    }

    /**
     * Verifies a PayMongo `Paymongo-Signature` header (`t=...,te=...,li=...`)
     * over the RAW request body via HMAC-SHA256, timing-safe comparison,
     * and a timestamp-tolerance replay guard (T-10-05-01). Never throws —
     * any parse/verification failure resolves to `false`.
     *
     * `te`/`li` are PayMongo's test-mode/live-mode signatures respectively;
     * this accepts a match against EITHER field using the caller-resolved
     * `secret` (already mode-selected by config/env.js's
     * PAYMONGO_WEBHOOK_SECRET), so callers never need to also pass mode.
     *
     * @param {{rawBody: string|Buffer, signatureHeader: string, secret?: string, now?: number}} params
     * @returns {boolean}
     */
    function verifyWebhookSignature({ rawBody, signatureHeader, secret = webhookSecret, now = Date.now() }) {
        try {
            if (!secret) return false;

            const parts = String(signatureHeader || '')
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
                .reduce((acc, part) => {
                    const [key, ...rest] = part.split('=');
                    if (key && rest.length > 0) acc[key.trim()] = rest.join('=').trim();
                    return acc;
                }, {});

            const timestamp = parts.t;
            const testSignature = parts.te;
            const liveSignature = parts.li;
            if (!timestamp || (!testSignature && !liveSignature)) return false;

            const timestampSeconds = Number.parseInt(timestamp, 10);
            if (!Number.isFinite(timestampSeconds)) return false;

            const toleranceSeconds = Number.isFinite(webhookTimestampToleranceSeconds)
                ? webhookTimestampToleranceSeconds
                : 300;
            const nowSeconds = Math.floor(Number(now) / 1000);
            if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) return false;

            const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '');
            const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
            const expectedBuffer = Buffer.from(expected, 'hex');

            const matches = (provided) => {
                if (!provided) return false;
                const providedBuffer = Buffer.from(provided, 'hex');
                return providedBuffer.length === expectedBuffer.length
                    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
            };

            return matches(testSignature) || matches(liveSignature);
        } catch {
            return false;
        }
    }

    return { createQrphPaymentIntent, verifyWebhookSignature };
}

export default buildPayMongoClient;
