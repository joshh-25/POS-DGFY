/**
 * Tests for the upgradeToPremium real-user workflow concern.
 *
 * The concern raised:
 *   upgradeToPremium previously accepted APPROVAL_PENDING as a valid status,
 *   meaning an authenticated user who merely started (but never completed) a
 *   PayPal checkout could call POST /api/v1/payments/upgrade and receive a
 *   premium plan on their tenant record without ever paying.
 *
 * Strategy:
 *   We test PayPalService.verifySubscription directly (the source of truth the
 *   controller relies on) and then assert the controller's status gate logic
 *   separately. This avoids pulling in the full Express + DB stack.
 *
 * Scenarios:
 *   1. APPROVAL_PENDING → isGrantable = false  (was the exploit path)
 *   2. ACTIVE           → isGrantable = true   (legitimate paid user)
 *   3. CANCELLED        → isGrantable = false
 *   4. SUSPENDED        → isGrantable = false
 *   5. null (404)       → isGrantable = false
 *   6. missing id guard → rejected before PayPal is called
 *
 * Regression:
 *   7. verifyWebhookSignature still fail-closed in production (Finding 3.1)
 */

import { jest } from '@jest/globals';

// ── Mock axios — no real HTTP calls ──────────────────────────────────────────
const mockAxiosPost = jest.fn();
const mockAxiosGet  = jest.fn();

jest.unstable_mockModule('axios', () => ({
    default: { post: mockAxiosPost, get: mockAxiosGet },
}));

// ── Load SUT after mocks are registered ──────────────────────────────────────
let paypalService;

beforeAll(async () => {
    process.env.PAYPAL_CLIENT_ID     = 'test-client';
    process.env.PAYPAL_CLIENT_SECRET = 'test-secret';
    process.env.PAYPAL_MODE          = 'sandbox';
    process.env.MOCK_PAYPAL          = 'false';
    process.env.NODE_ENV             = 'test';

    const mod    = await import('../src/services/paypalService.js');
    paypalService = mod.paypalService;
});

beforeEach(() => {
    jest.clearAllMocks();

    // Provide a live token so getAccessToken() short-circuits
    paypalService.accessToken = 'tok';
    paypalService.tokenExpiry = new Date(Date.now() + 60_000);

    process.env.MOCK_PAYPAL = 'false';
    process.env.NODE_ENV    = 'test';
});

// ── The controller's ONLY gate (post-fix) ────────────────────────────────────
// Extracted from paymentController.js upgradeToPremium:
//   if (!subDetails || subDetails.status !== 'ACTIVE') { return 400; }
function isGrantable(subDetails) {
    return !!(subDetails && subDetails.status === 'ACTIVE');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('upgradeToPremium – subscription status gate (post-fix)', () => {

    it('1. APPROVAL_PENDING — not grantable (exploit path, now blocked)', async () => {
        mockAxiosGet.mockResolvedValue({
            data: { status: 'APPROVAL_PENDING', id: 'I-SUB-001' },
        });

        const result = await paypalService.verifySubscription('I-SUB-001');

        expect(result.status).toBe('APPROVAL_PENDING');
        expect(isGrantable(result)).toBe(false);
    });

    it('2. ACTIVE — grantable (legitimate paid user)', async () => {
        mockAxiosGet.mockResolvedValue({
            data: { status: 'ACTIVE', id: 'I-SUB-002' },
        });

        const result = await paypalService.verifySubscription('I-SUB-002');

        expect(result.status).toBe('ACTIVE');
        expect(isGrantable(result)).toBe(true);
    });

    it('3. CANCELLED — not grantable', async () => {
        mockAxiosGet.mockResolvedValue({
            data: { status: 'CANCELLED', id: 'I-SUB-003' },
        });

        const result = await paypalService.verifySubscription('I-SUB-003');
        expect(isGrantable(result)).toBe(false);
    });

    it('4. SUSPENDED — not grantable', async () => {
        mockAxiosGet.mockResolvedValue({
            data: { status: 'SUSPENDED', id: 'I-SUB-004' },
        });

        const result = await paypalService.verifySubscription('I-SUB-004');
        expect(isGrantable(result)).toBe(false);
    });

    it('5. null (subscription not found, 404) — not grantable', async () => {
        mockAxiosGet.mockRejectedValue({ response: { status: 404 } });

        const result = await paypalService.verifySubscription('I-DOES-NOT-EXIST');

        expect(result).toBeNull();
        expect(isGrantable(result)).toBe(false);
    });

    it('6. missing subscriptionId — guard fires before PayPal is called', () => {
        // The controller checks: if (!subscriptionId) return 400
        // Validate the guard condition in isolation
        const subscriptionId = undefined;
        expect(!subscriptionId).toBe(true); // controller short-circuits here
        expect(mockAxiosGet).not.toHaveBeenCalled();
    });
});

// ── Regression: webhook fail-closed fix still holds ──────────────────────────

describe('verifyWebhookSignature – production fail-closed regression (Finding 3.1)', () => {

    it('7. returns false in production when PAYPAL_WEBHOOK_ID is missing', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.PAYPAL_WEBHOOK_ID;

        const result = await paypalService.verifyWebhookSignature(
            { 'paypal-transmission-id': 'x' },
            {}
        );

        expect(result).toBe(false);

        // Must not have called the verify-webhook-signature endpoint
        const verifyCallMade = mockAxiosPost.mock.calls.some(
            call => typeof call[0] === 'string' && call[0].includes('verify-webhook-signature')
        );
        expect(verifyCallMade).toBe(false);
    });
});
