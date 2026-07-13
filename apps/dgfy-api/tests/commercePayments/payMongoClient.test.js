import { jest } from '@jest/globals';
import crypto from 'crypto';
import {
    buildPayMongoClient,
    PayMongoError,
    PayMongoServiceUnavailableError
} from '../../src/modules/commercePayments/services/payMongoClient.js';

// Exercises 10-05-PLAN.md Task 1's <behavior> block: the QR Ph 3-call dance
// via mocked global `fetch` (zero new packages), and the raw-body webhook
// signature verify (valid / tampered body / stale timestamp). Mirrors
// tests/unit/modules/shifts/shiftUseCases.test.js's mocked-collaborator
// convention — no real network calls, no real DB.

const SECRET_KEY = 'sk_test_dummy_secret';
const WEBHOOK_SECRET = 'whsec_dummy_secret';
const BASE_URL = 'https://api.paymongo.com/v1';

const jsonResponse = (data, ok = true, status = 200) => ({
    ok,
    status,
    json: jest.fn().mockResolvedValue({ data })
});

describe('payMongoClient — createQrphPaymentIntent (3-call dance)', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('performs createPaymentIntent -> createPaymentMethod -> attachPaymentIntent and returns the QR + shared expiresAt', async () => {
        const expiresAtIso = '2026-07-13T12:30:00.000Z';
        const fetchMock = jest.fn()
            .mockResolvedValueOnce(jsonResponse({ id: 'pi_123', attributes: {} }))
            .mockResolvedValueOnce(jsonResponse({ id: 'pm_456', attributes: {} }))
            .mockResolvedValueOnce(jsonResponse({
                id: 'pi_123',
                attributes: {
                    next_action: {
                        code: {
                            image_url: 'https://paymongo.example/qr/pi_123.png',
                            expires_at: expiresAtIso
                        }
                    }
                }
            }));
        global.fetch = fetchMock;

        const client = buildPayMongoClient({ baseUrl: BASE_URL, secretKey: SECRET_KEY });
        const result = await client.createQrphPaymentIntent({
            amount: 10000,
            description: 'Order #1',
            metadata: { commerce_payment_session: 'CPS-1', tenant_id: 'tenant-uuid-1' }
        });

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock).toHaveBeenNthCalledWith(1, `${BASE_URL}/payment_intents`, expect.objectContaining({ method: 'POST' }));
        expect(fetchMock).toHaveBeenNthCalledWith(2, `${BASE_URL}/payment_methods`, expect.objectContaining({ method: 'POST' }));
        expect(fetchMock).toHaveBeenNthCalledWith(3, `${BASE_URL}/payment_intents/pi_123/attach`, expect.objectContaining({ method: 'POST' }));

        expect(result).toEqual({
            paymentIntentId: 'pi_123',
            paymentMethodId: 'pm_456',
            qrCodeImageUrl: 'https://paymongo.example/qr/pi_123.png',
            expiresAt: new Date(expiresAtIso)
        });
    });

    it('never sends split_payment on createPaymentIntent (D-02 excision)', async () => {
        const fetchMock = jest.fn()
            .mockResolvedValueOnce(jsonResponse({ id: 'pi_1', attributes: {} }))
            .mockResolvedValueOnce(jsonResponse({ id: 'pm_1', attributes: {} }))
            .mockResolvedValueOnce(jsonResponse({ id: 'pi_1', attributes: {} }));
        global.fetch = fetchMock;

        const client = buildPayMongoClient({ baseUrl: BASE_URL, secretKey: SECRET_KEY });
        await client.createQrphPaymentIntent({ amount: 5000, description: 'Order #2' });

        const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(firstCallBody.data.attributes).not.toHaveProperty('split_payment');
        expect(firstCallBody.data.attributes.payment_method_allowed).toEqual(['qrph']);
    });

    it('sends HTTP Basic auth header built from base64(secretKey + ":")', async () => {
        const fetchMock = jest.fn()
            .mockResolvedValueOnce(jsonResponse({ id: 'pi_1', attributes: {} }))
            .mockResolvedValueOnce(jsonResponse({ id: 'pm_1', attributes: {} }))
            .mockResolvedValueOnce(jsonResponse({ id: 'pi_1', attributes: {} }));
        global.fetch = fetchMock;

        const client = buildPayMongoClient({ baseUrl: BASE_URL, secretKey: SECRET_KEY });
        await client.createQrphPaymentIntent({ amount: 1000, description: 'Order #3' });

        const expectedAuth = `Basic ${Buffer.from(`${SECRET_KEY}:`).toString('base64')}`;
        fetchMock.mock.calls.forEach(([, options]) => {
            expect(options.headers.Authorization).toBe(expectedAuth);
        });
    });

    it('falls back to +30min expiry when PayMongo omits next_action.code.expires_at', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-13T12:00:00.000Z'));
        const fetchMock = jest.fn()
            .mockResolvedValueOnce(jsonResponse({ id: 'pi_1', attributes: {} }))
            .mockResolvedValueOnce(jsonResponse({ id: 'pm_1', attributes: {} }))
            .mockResolvedValueOnce(jsonResponse({ id: 'pi_1', attributes: { next_action: { code: {} } } }));
        global.fetch = fetchMock;

        const client = buildPayMongoClient({ baseUrl: BASE_URL, secretKey: SECRET_KEY });
        const result = await client.createQrphPaymentIntent({ amount: 1000, description: 'Order #4' });

        expect(result.expiresAt).toEqual(new Date('2026-07-13T12:30:00.000Z'));
        jest.useRealTimers();
    });

    it('maps a non-2xx PayMongo response to a typed PayMongoError carrying the provider error', async () => {
        const fetchMock = jest.fn().mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: jest.fn().mockResolvedValue({ errors: [{ detail: 'amount must be at least 10000' }] })
        });
        global.fetch = fetchMock;

        const client = buildPayMongoClient({ baseUrl: BASE_URL, secretKey: SECRET_KEY });
        await expect(client.createQrphPaymentIntent({ amount: 1, description: 'Order #5' }))
            .rejects.toMatchObject({
                name: 'PayMongoError',
                statusCode: 400,
                message: 'amount must be at least 10000'
            });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws a typed PayMongoServiceUnavailableError (no HTTP calls) when the secret key is not configured', async () => {
        const fetchMock = jest.fn();
        global.fetch = fetchMock;

        const client = buildPayMongoClient({ baseUrl: BASE_URL, secretKey: null });
        await expect(client.createQrphPaymentIntent({ amount: 1000, description: 'Order #6' }))
            .rejects.toBeInstanceOf(PayMongoServiceUnavailableError);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('payMongoClient — verifyWebhookSignature (raw-body HMAC, timing-safe)', () => {
    const rawBody = JSON.stringify({ data: { id: 'evt_1', attributes: { type: 'payment.paid' } } });

    const signRawBody = (timestamp, body, secret = WEBHOOK_SECRET) => crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${body}`)
        .digest('hex');

    it('returns true for a valid test-mode (te) signature within tolerance', () => {
        const client = buildPayMongoClient({ webhookSecret: WEBHOOK_SECRET, webhookTimestampToleranceSeconds: 300 });
        const nowSeconds = Math.floor(Date.now() / 1000);
        const signature = signRawBody(nowSeconds, rawBody);
        const signatureHeader = `t=${nowSeconds},te=${signature},li=deadbeef`;

        expect(client.verifyWebhookSignature({ rawBody, signatureHeader })).toBe(true);
    });

    it('returns true for a valid live-mode (li) signature within tolerance', () => {
        const client = buildPayMongoClient({ webhookSecret: WEBHOOK_SECRET, webhookTimestampToleranceSeconds: 300 });
        const nowSeconds = Math.floor(Date.now() / 1000);
        const signature = signRawBody(nowSeconds, rawBody);
        const signatureHeader = `t=${nowSeconds},te=deadbeef,li=${signature}`;

        expect(client.verifyWebhookSignature({ rawBody, signatureHeader })).toBe(true);
    });

    it('returns false when the raw body is tampered with after signing', () => {
        const client = buildPayMongoClient({ webhookSecret: WEBHOOK_SECRET, webhookTimestampToleranceSeconds: 300 });
        const nowSeconds = Math.floor(Date.now() / 1000);
        const signature = signRawBody(nowSeconds, rawBody);
        const signatureHeader = `t=${nowSeconds},te=${signature}`;
        const tamperedBody = JSON.stringify({ data: { id: 'evt_1', attributes: { type: 'payment.paid', amount: 999999 } } });

        expect(client.verifyWebhookSignature({ rawBody: tamperedBody, signatureHeader })).toBe(false);
    });

    it('returns false for a stale timestamp beyond tolerance', () => {
        const client = buildPayMongoClient({ webhookSecret: WEBHOOK_SECRET, webhookTimestampToleranceSeconds: 300 });
        const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes old, tolerance is 5
        const signature = signRawBody(staleTimestamp, rawBody);
        const signatureHeader = `t=${staleTimestamp},te=${signature}`;

        expect(client.verifyWebhookSignature({ rawBody, signatureHeader })).toBe(false);
    });

    it('returns false when signed with the wrong secret', () => {
        const client = buildPayMongoClient({ webhookSecret: WEBHOOK_SECRET, webhookTimestampToleranceSeconds: 300 });
        const nowSeconds = Math.floor(Date.now() / 1000);
        const signature = signRawBody(nowSeconds, rawBody, 'whsec_wrong_secret');
        const signatureHeader = `t=${nowSeconds},te=${signature}`;

        expect(client.verifyWebhookSignature({ rawBody, signatureHeader })).toBe(false);
    });

    it('never throws on a malformed signature header', () => {
        const client = buildPayMongoClient({ webhookSecret: WEBHOOK_SECRET });
        expect(() => client.verifyWebhookSignature({ rawBody, signatureHeader: 'garbage-not-key-value' })).not.toThrow();
        expect(client.verifyWebhookSignature({ rawBody, signatureHeader: 'garbage-not-key-value' })).toBe(false);
    });

    it('returns false (never throws) when the webhook secret is not configured', () => {
        const client = buildPayMongoClient({ webhookSecret: null });
        const nowSeconds = Math.floor(Date.now() / 1000);
        const signatureHeader = `t=${nowSeconds},te=anything`;

        expect(client.verifyWebhookSignature({ rawBody, signatureHeader })).toBe(false);
    });
});
