// Unit tests for the enrollment-status gate on money-moving affiliate cashout use cases (#451,
// Phase 197) in backend/src/modules/dgfy/usecases/dgfyAffiliateUseCases.js.
//
// No database is used: every use case builder here accepts `repository` as an injectable
// parameter, so a plain in-memory fake stands in for dgfyAffiliateRepository.js, mirroring the
// pattern in tests/dgfyAffiliatePriceRuleUseCases.unit.test.js (hand-rolled fake, no jest.mock).

import {
    buildRequestAffiliateCashoutUseCase,
    buildApproveAffiliateCashoutUseCase,
    buildMarkAffiliateCashoutPaidUseCase,
    buildCancelAffiliateCashoutUseCase,
    buildRejectAffiliateCashoutUseCase
} from '../src/modules/dgfy/usecases/dgfyAffiliateUseCases.js';

const TENANT_ID = 'tenant-1';
const ACCOUNT_ID = 'account-1';

// Mirrors the real dgfy_affiliate_enrollments.status enum: pending | active | suspended | revoked.
const makeFakeRepository = ({ enrollments = [], payoutMethods = [], cashouts = [], settings = {}, earnings = {} } = {}) => {
    const state = {
        enrollments: [...enrollments],
        payoutMethods: [...payoutMethods],
        cashouts: [...cashouts],
        nextCashoutId: (cashouts.reduce((max, c) => Math.max(max, c.cashout_id || 0), 0)) + 1
    };

    const findEnrollmentForCashout = (cashout) => state.enrollments.find((e) => e.enrollment_id === cashout.enrollment_id) || null;

    return {
        __state: state,
        async findEnrollmentByAccountAndTenant(dgfyAccountId, tenantId) {
            return state.enrollments.find((e) => e.dgfy_account_id === dgfyAccountId && e.tenant_id === tenantId) || null;
        },
        async listPayoutMethods() {
            return state.payoutMethods;
        },
        async getSettings() {
            return { min_cashout_centavos: 0, ...settings };
        },
        async getEarningsSummary() {
            return { available_centavos: 100000, ...earnings };
        },
        async requestCashout({ enrollmentId, tenantId, dgfyAccountId, payoutMethodId, payoutSnapshot }) {
            const cashout = {
                cashout_id: state.nextCashoutId++,
                enrollment_id: enrollmentId,
                tenant_id: tenantId,
                dgfy_account_id: dgfyAccountId,
                payout_method_id: payoutMethodId,
                payout_snapshot: payoutSnapshot,
                status: 'requested'
            };
            state.cashouts.push(cashout);
            return cashout;
        },
        async approveCashout(cashoutId, { tenantId, approvedByUserId = null }) {
            const cashout = state.cashouts.find((c) => c.cashout_id === Number(cashoutId) && c.tenant_id === tenantId);
            if (!cashout) return { cashout: null, reason: 'not_found' };
            if (cashout.status !== 'requested') return { cashout, reason: 'invalid_status' };
            const enrollment = findEnrollmentForCashout(cashout);
            if (enrollment?.status !== 'active') return { cashout, reason: 'enrollment_inactive' };
            cashout.status = 'approved';
            cashout.approved_by_user_id = approvedByUserId;
            return { cashout, reason: null };
        },
        async markCashoutPaid(cashoutId, { tenantId, externalPaymentRef }) {
            const cashout = state.cashouts.find((c) => c.cashout_id === Number(cashoutId) && c.tenant_id === tenantId);
            if (!cashout) return { cashout: null, reason: 'not_found' };
            if (cashout.status !== 'approved') return { cashout, reason: 'invalid_status' };
            const enrollment = findEnrollmentForCashout(cashout);
            if (enrollment?.status !== 'active') return { cashout, reason: 'enrollment_inactive' };
            cashout.status = 'paid';
            cashout.external_payment_ref = externalPaymentRef;
            return { cashout, reason: null };
        },
        async cancelCashout(cashoutId, { dgfyAccountId }) {
            const cashout = state.cashouts.find((c) => c.cashout_id === Number(cashoutId) && c.dgfy_account_id === dgfyAccountId);
            if (!cashout) return { cashout: null, reason: 'not_found' };
            if (cashout.status !== 'requested') return { cashout, reason: 'invalid_status' };
            cashout.status = 'cancelled';
            return { cashout, reason: null };
        },
        async rejectCashout(cashoutId, { tenantId, rejectionReason = null }) {
            const cashout = state.cashouts.find((c) => c.cashout_id === Number(cashoutId) && c.tenant_id === tenantId);
            if (!cashout) return { cashout: null, reason: 'not_found' };
            if (!['requested', 'approved'].includes(cashout.status)) return { cashout, reason: 'invalid_status' };
            cashout.status = 'rejected';
            cashout.rejection_reason = rejectionReason;
            return { cashout, reason: null };
        }
    };
};

const baseEnrollment = (status) => ({
    enrollment_id: 1,
    tenant_id: TENANT_ID,
    dgfy_account_id: ACCOUNT_ID,
    status
});

const basePayoutMethod = { payout_method_id: 1, is_default: true };

describe('buildRequestAffiliateCashoutUseCase — enrollment status gate', () => {
    test.each(['revoked', 'suspended', 'pending'])('blocks a %s enrollment with 409 CONFLICT', async (status) => {
        const repository = makeFakeRepository({
            enrollments: [baseEnrollment(status)],
            payoutMethods: [basePayoutMethod]
        });
        const useCase = buildRequestAffiliateCashoutUseCase({ repository });
        const result = await useCase({ account: { id: ACCOUNT_ID }, body: { tenant_id: TENANT_ID } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
        expect(repository.__state.cashouts).toHaveLength(0);
    });

    test('an active enrollment can still request a cashout', async () => {
        const repository = makeFakeRepository({
            enrollments: [baseEnrollment('active')],
            payoutMethods: [basePayoutMethod]
        });
        const useCase = buildRequestAffiliateCashoutUseCase({ repository });
        const result = await useCase({ account: { id: ACCOUNT_ID }, body: { tenant_id: TENANT_ID } });
        expect(result.success).toBe(true);
        expect(result.data.cashout.status).toBe('requested');
    });
});

describe('buildApproveAffiliateCashoutUseCase — enrollment status gate', () => {
    test.each(['revoked', 'suspended', 'pending'])('blocks approval when the enrollment is %s with 409 CONFLICT', async (status) => {
        const repository = makeFakeRepository({
            enrollments: [baseEnrollment(status)],
            cashouts: [{ cashout_id: 1, enrollment_id: 1, tenant_id: TENANT_ID, dgfy_account_id: ACCOUNT_ID, status: 'requested' }]
        });
        const useCase = buildApproveAffiliateCashoutUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, cashoutId: 1 });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
    });

    test('an active enrollment can still be approved', async () => {
        const repository = makeFakeRepository({
            enrollments: [baseEnrollment('active')],
            cashouts: [{ cashout_id: 1, enrollment_id: 1, tenant_id: TENANT_ID, dgfy_account_id: ACCOUNT_ID, status: 'requested' }]
        });
        const useCase = buildApproveAffiliateCashoutUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, cashoutId: 1 });
        expect(result.success).toBe(true);
        expect(result.data.cashout.status).toBe('approved');
    });
});

describe('buildMarkAffiliateCashoutPaidUseCase — enrollment status gate', () => {
    test.each(['revoked', 'suspended', 'pending'])('blocks mark-paid when the enrollment is %s with 409 CONFLICT', async (status) => {
        const repository = makeFakeRepository({
            enrollments: [baseEnrollment(status)],
            cashouts: [{ cashout_id: 1, enrollment_id: 1, tenant_id: TENANT_ID, dgfy_account_id: ACCOUNT_ID, status: 'approved' }]
        });
        const useCase = buildMarkAffiliateCashoutPaidUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, cashoutId: 1, body: { external_payment_ref: 'ref-1' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
    });

    test('an active enrollment can still be marked as paid', async () => {
        const repository = makeFakeRepository({
            enrollments: [baseEnrollment('active')],
            cashouts: [{ cashout_id: 1, enrollment_id: 1, tenant_id: TENANT_ID, dgfy_account_id: ACCOUNT_ID, status: 'approved' }]
        });
        const useCase = buildMarkAffiliateCashoutPaidUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, cashoutId: 1, body: { external_payment_ref: 'ref-1' } });
        expect(result.success).toBe(true);
        expect(result.data.cashout.status).toBe('paid');
    });
});

describe('buildCancelAffiliateCashoutUseCase / buildRejectAffiliateCashoutUseCase — not gated', () => {
    // Deliberately ungated (#451, Phase 197): cancel/reject release or deny a request rather than
    // move money, so gating them would strand reserved commission on a revoked affiliate.
    test('cancel still succeeds on a revoked enrollment', async () => {
        const repository = makeFakeRepository({
            enrollments: [baseEnrollment('revoked')],
            cashouts: [{ cashout_id: 1, enrollment_id: 1, tenant_id: TENANT_ID, dgfy_account_id: ACCOUNT_ID, status: 'requested' }]
        });
        const useCase = buildCancelAffiliateCashoutUseCase({ repository });
        const result = await useCase({ account: { id: ACCOUNT_ID }, cashoutId: 1 });
        expect(result.success).toBe(true);
        expect(result.data.cashout.status).toBe('cancelled');
    });

    test('reject still succeeds on a revoked enrollment', async () => {
        const repository = makeFakeRepository({
            enrollments: [baseEnrollment('revoked')],
            cashouts: [{ cashout_id: 1, enrollment_id: 1, tenant_id: TENANT_ID, dgfy_account_id: ACCOUNT_ID, status: 'requested' }]
        });
        const useCase = buildRejectAffiliateCashoutUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, cashoutId: 1, body: { rejection_reason: 'no longer eligible' } });
        expect(result.success).toBe(true);
        expect(result.data.cashout.status).toBe('rejected');
    });
});
