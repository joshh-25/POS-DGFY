/**
 * Unit tests for PayPalService.verifyWebhookSignature
 *
 * Security Finding 3.1 – Webhook verification fails open when PAYPAL_WEBHOOK_ID is missing.
 *
 * Scenarios tested:
 *   A) NODE_ENV=production + PAYPAL_WEBHOOK_ID missing  → must return false (fail-closed)
 *   B) NODE_ENV=development + PAYPAL_WEBHOOK_ID missing → returns true  (dev convenience)
 *   C) NODE_ENV=test       + PAYPAL_WEBHOOK_ID missing  → returns true  (same as dev)
 *   D) MOCK_PAYPAL=true (non-production)                → returns true  (mock backdoor)
 *   E) PAYPAL_WEBHOOK_ID present, PayPal API SUCCESS    → returns true
 *   F) PAYPAL_WEBHOOK_ID present, PayPal API FAILURE    → returns false
 */

import { jest } from '@jest/globals';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Capture the original env, restore it after each test. */
const savedEnv = {};
const ENV_KEYS = ['NODE_ENV', 'PAYPAL_WEBHOOK_ID', 'MOCK_PAYPAL', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_MODE'];

function saveEnv() {
    ENV_KEYS.forEach(k => { savedEnv[k] = process.env[k]; });
}

function restoreEnv() {
    ENV_KEYS.forEach(k => {
        if (savedEnv[k] === undefined) {
            delete process.env[k];
        } else {
            process.env[k] = savedEnv[k];
        }
    });
}

/** Minimal fake headers – content doesn't matter for unit-level tests */
const fakeHeaders = {
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-360caa42',
    'paypal-transmission-id': 'abc-123',
    'paypal-transmission-sig': 'sig==',
    'paypal-transmission-time': '2026-02-17T00:00:00Z',
};
const fakeBody = { id: 'WH-EVT-001', event_type: 'PAYMENT.SALE.COMPLETED', resource: {} };

// ── mock axios so no real HTTP calls are made ─────────────────────────────────

// We mock at the module level so the paypalService picks it up when imported.
const mockAxiosPost = jest.fn();
const mockAxiosGet  = jest.fn();

jest.unstable_mockModule('axios', () => ({
    default: {
        post: mockAxiosPost,
        get:  mockAxiosGet,
    },
}));

// ── load SUT after mocks are registered ──────────────────────────────────────

let paypalService;

beforeAll(async () => {
    // Dynamic import so Jest's module registry picks up the mocks above.
    const mod = await import('../src/services/paypalService.js');
    paypalService = mod.paypalService;
});

// ── shared setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
    saveEnv();
    jest.clearAllMocks();

    // Provide minimal PayPal credentials so getAccessToken() won't throw
    process.env.PAYPAL_CLIENT_ID     = 'test-client-id';
    process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
    process.env.PAYPAL_MODE          = 'sandbox';

    // Default: token exchange succeeds
    mockAxiosPost.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 },
    });
});

afterEach(() => {
    restoreEnv();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('PayPalService.verifyWebhookSignature – Security Finding 3.1', () => {

    // ── Scenario A ──────────────────────────────────────────────────────────
    it('A) returns false (fail-closed) in production when PAYPAL_WEBHOOK_ID is missing', async () => {
        process.env.NODE_ENV          = 'production';
        process.env.MOCK_PAYPAL       = 'false';
        delete process.env.PAYPAL_WEBHOOK_ID;

        // Force service to re-fetch a token (clear cached token from previous tests)
        paypalService.accessToken  = null;
        paypalService.tokenExpiry  = null;

        const result = await paypalService.verifyWebhookSignature(fakeHeaders, fakeBody);

        expect(result).toBe(false);

        // The PayPal verify-webhook-signature endpoint must NOT have been called –
        // we should reject before making any external request.
        const verifyCallMade = mockAxiosPost.mock.calls.some(
            call => typeof call[0] === 'string' && call[0].includes('verify-webhook-signature')
        );
        expect(verifyCallMade).toBe(false);
    });

    // ── Scenario B ──────────────────────────────────────────────────────────
    it('B) returns true (fail-open) in development when PAYPAL_WEBHOOK_ID is missing', async () => {
        process.env.NODE_ENV          = 'development';
        process.env.MOCK_PAYPAL       = 'false';
        delete process.env.PAYPAL_WEBHOOK_ID;

        paypalService.accessToken = null;
        paypalService.tokenExpiry = null;

        const result = await paypalService.verifyWebhookSignature(fakeHeaders, fakeBody);

        expect(result).toBe(true);
    });

    // ── Scenario C ──────────────────────────────────────────────────────────
    it('C) returns true (fail-open) in test environment when PAYPAL_WEBHOOK_ID is missing', async () => {
        process.env.NODE_ENV          = 'test';
        process.env.MOCK_PAYPAL       = 'false';
        delete process.env.PAYPAL_WEBHOOK_ID;

        paypalService.accessToken = null;
        paypalService.tokenExpiry = null;

        const result = await paypalService.verifyWebhookSignature(fakeHeaders, fakeBody);

        expect(result).toBe(true);
    });

    // ── Scenario D ──────────────────────────────────────────────────────────
    it('D) returns true immediately when MOCK_PAYPAL=true in non-production', async () => {
        process.env.NODE_ENV    = 'development';
        process.env.MOCK_PAYPAL = 'true';
        // Even if the webhook ID is set, mock should short-circuit
        process.env.PAYPAL_WEBHOOK_ID = 'WH-SOME-ID';

        paypalService.accessToken = null;
        paypalService.tokenExpiry = null;

        const result = await paypalService.verifyWebhookSignature(fakeHeaders, fakeBody);

        expect(result).toBe(true);
        // No HTTP calls should have been made at all
        expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    // ── Scenario E ──────────────────────────────────────────────────────────
    it('E) returns true when PayPal API responds with verification_status=SUCCESS', async () => {
        process.env.NODE_ENV          = 'production';
        process.env.MOCK_PAYPAL       = 'false';
        process.env.PAYPAL_WEBHOOK_ID = 'WH-REAL-ID';

        paypalService.accessToken = null;
        paypalService.tokenExpiry = null;

        // First call: token exchange; second call: verify-webhook-signature
        mockAxiosPost
            .mockResolvedValueOnce({ data: { access_token: 'tok', expires_in: 3600 } })
            .mockResolvedValueOnce({ data: { verification_status: 'SUCCESS' } });

        const result = await paypalService.verifyWebhookSignature(fakeHeaders, fakeBody);

        expect(result).toBe(true);
    });

    // ── Scenario F ──────────────────────────────────────────────────────────
    it('F) returns false when PayPal API responds with verification_status !== SUCCESS', async () => {
        process.env.NODE_ENV          = 'production';
        process.env.MOCK_PAYPAL       = 'false';
        process.env.PAYPAL_WEBHOOK_ID = 'WH-REAL-ID';

        paypalService.accessToken = null;
        paypalService.tokenExpiry = null;

        mockAxiosPost
            .mockResolvedValueOnce({ data: { access_token: 'tok', expires_in: 3600 } })
            .mockResolvedValueOnce({ data: { verification_status: 'FAILURE' } });

        const result = await paypalService.verifyWebhookSignature(fakeHeaders, fakeBody);

        expect(result).toBe(false);
    });
});
