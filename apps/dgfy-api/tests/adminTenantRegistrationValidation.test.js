/**
 * Tests for the registerCompanyRequest admin workflow concern.
 *
 * The concern:
 *   Premium plan registration previously accepted APPROVAL_PENDING as a valid status,
 *   allowing auto-approval and provisioning without confirmed payment.
 */

import { jest } from '@jest/globals';

// ── Mock axios — no real HTTP calls ──────────────────────────────────────────
const mockAxiosGet = jest.fn();
jest.unstable_mockModule('axios', () => ({
    default: { get: mockAxiosGet },
}));

// ── Load SUT after mocks are registered ──────────────────────────────────────
let paypalService;

beforeAll(async () => {
    process.env.PAYPAL_CLIENT_ID = 'test-client';
    process.env.PAYPAL_CLIENT_SECRET = 'test-secret';
    process.env.PAYPAL_MODE = 'sandbox';
    process.env.MOCK_PAYPAL = 'false';
    process.env.NODE_ENV = 'test';

    const mod = await import('../src/services/paypalService.js');
    paypalService = mod.paypalService;
});

beforeEach(() => {
    jest.clearAllMocks();
    paypalService.accessToken = 'tok';
    paypalService.tokenExpiry = new Date(Date.now() + 60_000);
});

// ── The controller's auto-approve gate (post-fix) ────────────────────────────
// Extracted from adminTenantController.js registerCompanyRequest:
// if (subDetails && subDetails.status === 'ACTIVE') { ... initialStatus = 'active'; }
function willAutoApprove(subDetails) {
    return !!(subDetails && subDetails.status === 'ACTIVE');
}

describe('registerCompanyRequest – auto-approval gate (post-fix)', () => {

    it('1. APPROVAL_PENDING — does NOT auto-approve (exploit path blocked)', async () => {
        mockAxiosGet.mockResolvedValue({
            data: { status: 'APPROVAL_PENDING', id: 'I-SUB-REQ-001' },
        });

        const result = await paypalService.verifySubscription('I-SUB-REQ-001');

        expect(result.status).toBe('APPROVAL_PENDING');
        expect(willAutoApprove(result)).toBe(false);
    });

    it('2. ACTIVE — DOES auto-approve (legitimate paid user)', async () => {
        mockAxiosGet.mockResolvedValue({
            data: { status: 'ACTIVE', id: 'I-SUB-REQ-002' },
        });

        const result = await paypalService.verifySubscription('I-SUB-REQ-002');

        expect(result.status).toBe('ACTIVE');
        expect(willAutoApprove(result)).toBe(true);
    });

    it('3. SUSPENDED/CANCELLED — does NOT auto-approve', async () => {
        mockAxiosGet.mockResolvedValue({
            data: { status: 'CANCELLED', id: 'I-SUB-REQ-003' },
        });

        const result = await paypalService.verifySubscription('I-SUB-REQ-003');
        expect(willAutoApprove(result)).toBe(false);
    });

    it('4. null (not found) — does NOT auto-approve', async () => {
        mockAxiosGet.mockRejectedValue({ response: { status: 404 } });
        const result = await paypalService.verifySubscription('NON-EXISTENT');
        expect(willAutoApprove(result)).toBe(false);
    });
});
