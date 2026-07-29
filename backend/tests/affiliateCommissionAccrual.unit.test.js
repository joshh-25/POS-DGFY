// Characterization tests for backend/src/modules/dgfy/utils/affiliateCommissionAccrual.js.
//
// Written ahead of the affiliate pricing rule engine work (see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md, decision A3) specifically to pin
// TODAY's accrual behavior before it changes. As of this commit there is no other test coverage for
// this module anywhere in the suite, so these tests are the only regression net under the upcoming
// commission-base change. They intentionally describe current behavior, including the parts A3
// will change - a later commit updates the affected assertions instead of adding new ones, so the
// diff itself documents the behavior change.
//
// No database is used: affiliateCommissionAccrual.js accepts `repository` as an injectable
// parameter on every exported function, so a plain in-memory fake stands in for
// dgfyAffiliateRepository.js. This mirrors the existing pure-unit pattern used by
// tests/commercialPromoPolicy.unit.test.js.

import {
    resolveActiveAffiliateEnrollment,
    resolveActiveAffiliateEnrollmentById,
    accrueEarnedForInStoreSale,
    accruePendingForOnlineOrder,
    settleAffiliateCommissionForOrder,
    reverseAffiliateCommissionForOrder
} from '../src/modules/dgfy/utils/affiliateCommissionAccrual.js';

const TENANT_ID = 'tenant-1';

const makeFakeRepository = ({
    settings = { program_enabled: true, default_rate_bps: 500 },
    enrollments = [],
    commissions = []
} = {}) => {
    const attributions = [];
    const recordedCommissions = [...commissions];

    return {
        __state: { attributions, commissions: recordedCommissions },

        async getSettings() {
            return settings;
        },

        async findActiveEnrollmentByShareCode(tenantId, code) {
            return enrollments.find((e) => (
                e.tenant_id === tenantId
                && e.share_code === code
                && e.status === 'active'
            )) || null;
        },

        async findEnrollmentById(tenantId, enrollmentId) {
            return enrollments.find((e) => (
                e.tenant_id === tenantId
                && String(e.enrollment_id) === String(enrollmentId)
            )) || null;
        },

        async recordAttribution(payload) {
            const row = { attribution_id: attributions.length + 1, ...payload };
            attributions.push(row);
            return row;
        },

        async createEarnedCommissionIfMissing(payload) {
            const existing = recordedCommissions.find((c) => (
                c.tenant_id === payload.tenantId && c.order_reference === payload.orderReference
            ));
            if (existing) return { commission: existing, created: false };
            const row = {
                commission_id: recordedCommissions.length + 1,
                tenant_id: payload.tenantId,
                enrollment_id: payload.enrollmentId,
                order_reference: payload.orderReference,
                commissionable_base_centavos: payload.commissionableBaseCentavos,
                rate_bps_snapshot: payload.rateBpsSnapshot,
                amount_centavos: payload.amountCentavos,
                status: 'earned',
                reason: payload.reason
            };
            recordedCommissions.push(row);
            return { commission: row, created: true };
        },

        async createPendingCommissionIfMissing(payload) {
            const existing = recordedCommissions.find((c) => (
                c.tenant_id === payload.tenantId && c.order_reference === payload.orderReference
            ));
            if (existing) return { commission: existing, created: false };
            const row = {
                commission_id: recordedCommissions.length + 1,
                tenant_id: payload.tenantId,
                enrollment_id: payload.enrollmentId,
                order_reference: payload.orderReference,
                commissionable_base_centavos: payload.commissionableBaseCentavos,
                rate_bps_snapshot: payload.rateBpsSnapshot,
                amount_centavos: payload.amountCentavos,
                status: 'pending',
                reason: payload.reason
            };
            recordedCommissions.push(row);
            return { commission: row, created: true };
        },

        async markCommissionEarnedByOrderReference(tenantId, orderReference) {
            const row = recordedCommissions.find((c) => (
                c.tenant_id === tenantId && c.order_reference === orderReference
            ));
            if (!row) return { updated: false, reason: 'not_found' };
            if (row.status === 'paid') return { updated: false, reason: 'already_paid' };
            row.status = 'earned';
            return { updated: true, commission: row };
        },

        async reverseCommissionByOrderReference(tenantId, orderReference) {
            const row = recordedCommissions.find((c) => (
                c.tenant_id === tenantId && c.order_reference === orderReference
            ));
            if (!row) return { reversed: false, reason: 'not_found' };
            if (row.status === 'paid') return { reversed: false, reason: 'already_paid' };
            row.status = 'reversed';
            return { reversed: true, commission: row };
        }
    };
};

describe('resolveActiveAffiliateEnrollment / resolveActiveAffiliateEnrollmentById — null-means-no-attribution contract', () => {
    test('returns null when the program is disabled for the tenant', async () => {
        const repository = makeFakeRepository({ settings: { program_enabled: false } });
        expect(await resolveActiveAffiliateEnrollment({
            tenantId: TENANT_ID,
            affiliateCode: 'AF-ABC123',
            repository
        })).toBeNull();
    });

    test('returns null when the code is blank or the tenant is missing, never throws', async () => {
        const repository = makeFakeRepository();
        expect(await resolveActiveAffiliateEnrollment({ tenantId: TENANT_ID, affiliateCode: '', repository })).toBeNull();
        expect(await resolveActiveAffiliateEnrollment({ tenantId: null, affiliateCode: 'AF-ABC123', repository })).toBeNull();
    });

    test('resolves an active enrollment by share code, case/whitespace tolerant on the code', async () => {
        const enrollment = { enrollment_id: 1, tenant_id: TENANT_ID, dgfy_account_id: 'acct-1', share_code: 'AF-ABC123', status: 'active' };
        const repository = makeFakeRepository({ enrollments: [enrollment] });
        const resolved = await resolveActiveAffiliateEnrollment({
            tenantId: TENANT_ID,
            affiliateCode: '  AF-ABC123  ',
            repository
        });
        expect(resolved).toEqual(enrollment);
    });

    test('resolveActiveAffiliateEnrollmentById returns null for a non-active enrollment status', async () => {
        const enrollment = { enrollment_id: 2, tenant_id: TENANT_ID, dgfy_account_id: 'acct-2', status: 'suspended' };
        const repository = makeFakeRepository({ enrollments: [enrollment] });
        expect(await resolveActiveAffiliateEnrollmentById({
            tenantId: TENANT_ID,
            enrollmentId: 2,
            repository
        })).toBeNull();
    });

    test('resolveActiveAffiliateEnrollmentById returns null when program is disabled, even for a valid enrollment id', async () => {
        const enrollment = { enrollment_id: 3, tenant_id: TENANT_ID, dgfy_account_id: 'acct-3', status: 'active' };
        const repository = makeFakeRepository({ settings: { program_enabled: false }, enrollments: [enrollment] });
        expect(await resolveActiveAffiliateEnrollmentById({
            tenantId: TENANT_ID,
            enrollmentId: 3,
            repository
        })).toBeNull();
    });

    test('resolveActiveAffiliateEnrollmentById resolves an active enrollment', async () => {
        const enrollment = { enrollment_id: 4, tenant_id: TENANT_ID, dgfy_account_id: 'acct-4', status: 'active' };
        const repository = makeFakeRepository({ enrollments: [enrollment] });
        expect(await resolveActiveAffiliateEnrollmentById({
            tenantId: TENANT_ID,
            enrollmentId: 4,
            repository
        })).toEqual(enrollment);
    });
});

describe('rate resolution ladder — enrollment override > tenant default > hardcoded 500', () => {
    test('uses the enrollment-level commission_rate_bps override when present', async () => {
        const enrollment = { enrollment_id: 10, dgfy_account_id: 'acct-10', commission_rate_bps: 800 };
        const repository = makeFakeRepository({ settings: { program_enabled: true, default_rate_bps: 500 } });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-1',
            commissionableBaseCentavos: 10000,
            repository
        });
        expect(commission.rate_bps_snapshot).toBe(800);
        expect(commission.amount_centavos).toBe(800); // 10000 * 800 / 10000
    });

    test('falls back to the tenant default_rate_bps when the enrollment has no override', async () => {
        const enrollment = { enrollment_id: 11, dgfy_account_id: 'acct-11', commission_rate_bps: null };
        const repository = makeFakeRepository({ settings: { program_enabled: true, default_rate_bps: 700 } });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-2',
            commissionableBaseCentavos: 10000,
            repository
        });
        expect(commission.rate_bps_snapshot).toBe(700);
    });

    test('falls back to the hardcoded 500 bps when neither override nor tenant default is set', async () => {
        const enrollment = { enrollment_id: 12, dgfy_account_id: 'acct-12', commission_rate_bps: null };
        const repository = makeFakeRepository({ settings: { program_enabled: true, default_rate_bps: null } });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-3',
            commissionableBaseCentavos: 10000,
            repository
        });
        expect(commission.rate_bps_snapshot).toBe(500);
        expect(commission.amount_centavos).toBe(500);
    });
});

describe('commission base — TODAY is subtotal minus discount (ADR 0036 Decision 3, pre-A3)', () => {
    // This test intentionally pins the *current* base semantics. When decision A3 lands, the caller
    // computes commissionableBaseCentavos from either the discounted or base-price subtotal depending
    // on the tenant's commission_base_mode flag - this module itself is base-agnostic, it just rounds
    // and applies the rate to whatever base it is handed. This test documents the pre-A3 caller
    // convention so the diff at the caller (storeUseCases.js) is what visibly changes, not this file.
    test('accrues on the caller-supplied base (subtotal - discount today), never re-derives it', async () => {
        const enrollment = { enrollment_id: 20, dgfy_account_id: 'acct-20', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        const subtotalCentavos = 10000; // PHP 100.00
        const discountCentavos = 1000; // PHP 10.00 promo/affiliate discount
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-4',
            commissionableBaseCentavos: subtotalCentavos - discountCentavos,
            repository
        });
        expect(commission.commissionable_base_centavos).toBe(9000);
        expect(commission.amount_centavos).toBe(450); // 9000 * 500 / 10000
    });

    test('negative/garbage base input is floored to 0, never a negative commission', async () => {
        const enrollment = { enrollment_id: 21, dgfy_account_id: 'acct-21', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-5',
            commissionableBaseCentavos: -500,
            repository
        });
        expect(commission.commissionable_base_centavos).toBe(0);
        expect(commission.amount_centavos).toBe(0);
    });
});

describe('self-referral guard', () => {
    test('in-store path is a no-op guard: buyer identity is unknown, so the same-account check never fires', async () => {
        const enrollment = { enrollment_id: 30, dgfy_account_id: 'acct-30', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        // Even if a buyer id happened to be passed in-store, this path only enforces it because
        // in-store checkout doesn't capture identity today - included here to document that this
        // parameter is accepted but the guard is live wherever an id is actually supplied.
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-6',
            commissionableBaseCentavos: 5000,
            buyerDgfyAccountId: 'acct-30',
            repository
        });
        expect(commission).toBeNull();
    });

    test('online path blocks commission when the buyer is the affiliate themself', async () => {
        const enrollment = { enrollment_id: 31, dgfy_account_id: 'acct-31', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        const commission = await accruePendingForOnlineOrder({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-7',
            commissionableBaseCentavos: 5000,
            buyerDgfyAccountId: 'acct-31',
            repository
        });
        expect(commission).toBeNull();
    });

    test('online path accrues normally when the buyer differs from the affiliate', async () => {
        const enrollment = { enrollment_id: 32, dgfy_account_id: 'acct-32', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        const commission = await accruePendingForOnlineOrder({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-8',
            commissionableBaseCentavos: 5000,
            buyerDgfyAccountId: 'acct-99',
            repository
        });
        expect(commission).not.toBeNull();
        expect(commission.status).toBe('pending');
    });
});

describe('channel lifecycle: in-store earns immediately, online starts pending', () => {
    test('accrueEarnedForInStoreSale writes status earned directly', async () => {
        const enrollment = { enrollment_id: 40, dgfy_account_id: 'acct-40', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-9',
            commissionableBaseCentavos: 5000,
            repository
        });
        expect(commission.status).toBe('earned');
        expect(commission.reason).toBe('in_store_sale');
    });

    test('accruePendingForOnlineOrder writes status pending, reason online_order', async () => {
        const enrollment = { enrollment_id: 41, dgfy_account_id: 'acct-41', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        const commission = await accruePendingForOnlineOrder({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-10',
            commissionableBaseCentavos: 5000,
            repository
        });
        expect(commission.status).toBe('pending');
        expect(commission.reason).toBe('online_order');
    });

    test('settleAffiliateCommissionForOrder flips pending -> earned on outcome "earned"', async () => {
        const enrollment = { enrollment_id: 42, dgfy_account_id: 'acct-42', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        await accruePendingForOnlineOrder({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-11',
            commissionableBaseCentavos: 5000,
            repository
        });
        const result = await settleAffiliateCommissionForOrder({
            tenantId: TENANT_ID,
            orderReference: 'ORD-11',
            outcome: 'earned',
            repository
        });
        expect(result.updated).toBe(true);
        expect(repository.__state.commissions.find((c) => c.order_reference === 'ORD-11').status).toBe('earned');
    });

    test('settleAffiliateCommissionForOrder flips pending -> reversed on outcome "reversed"', async () => {
        const enrollment = { enrollment_id: 43, dgfy_account_id: 'acct-43', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        await accruePendingForOnlineOrder({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-12',
            commissionableBaseCentavos: 5000,
            repository
        });
        const result = await settleAffiliateCommissionForOrder({
            tenantId: TENANT_ID,
            orderReference: 'ORD-12',
            outcome: 'reversed',
            repository
        });
        expect(result.updated).toBe(true);
        expect(repository.__state.commissions.find((c) => c.order_reference === 'ORD-12').status).toBe('reversed');
    });

    test('settleAffiliateCommissionForOrder reports invalid_outcome for an unrecognized outcome, and never throws', async () => {
        const repository = makeFakeRepository();
        const result = await settleAffiliateCommissionForOrder({
            tenantId: TENANT_ID,
            orderReference: 'ORD-13',
            outcome: 'something_else',
            repository
        });
        expect(result).toEqual({ updated: false, reason: 'invalid_outcome' });
    });
});

describe('idempotency — duplicate calls for the same order_reference never double-accrue', () => {
    test('a repeated accrueEarnedForInStoreSale call for the same order_reference is a silent no-op', async () => {
        const enrollment = { enrollment_id: 50, dgfy_account_id: 'acct-50', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        const first = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-14',
            commissionableBaseCentavos: 5000,
            repository
        });
        const second = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-14',
            commissionableBaseCentavos: 999999, // different base, should still be ignored
            repository
        });
        expect(second).toEqual(first);
        expect(repository.__state.commissions.filter((c) => c.order_reference === 'ORD-14')).toHaveLength(1);
    });
});

describe('reversal — reverseAffiliateCommissionForOrder / missing-reference guard', () => {
    test('returns a clean failure (never throws) when tenantId or orderReference is missing', async () => {
        const repository = makeFakeRepository();
        expect(await reverseAffiliateCommissionForOrder({ tenantId: null, orderReference: 'ORD-15', repository }))
            .toEqual({ reversed: false, reason: 'missing_reference' });
        expect(await reverseAffiliateCommissionForOrder({ tenantId: TENANT_ID, orderReference: null, repository }))
            .toEqual({ reversed: false, reason: 'missing_reference' });
    });

    test('reverses an earned in-store commission by its order_reference', async () => {
        const enrollment = { enrollment_id: 60, dgfy_account_id: 'acct-60', commission_rate_bps: 500 };
        const repository = makeFakeRepository();
        await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment,
            orderReference: 'ORD-16',
            commissionableBaseCentavos: 5000,
            repository
        });
        const result = await reverseAffiliateCommissionForOrder({
            tenantId: TENANT_ID,
            orderReference: 'ORD-16',
            repository
        });
        expect(result.reversed).toBe(true);
        expect(repository.__state.commissions.find((c) => c.order_reference === 'ORD-16').status).toBe('reversed');
    });

    test('reversing an unknown order_reference reports not_found rather than throwing', async () => {
        const repository = makeFakeRepository();
        const result = await reverseAffiliateCommissionForOrder({
            tenantId: TENANT_ID,
            orderReference: 'ORD-DOES-NOT-EXIST',
            repository
        });
        expect(result).toEqual({ reversed: false, reason: 'not_found' });
    });
});

describe('missing required arguments — every accrual entrypoint returns null/false rather than throwing', () => {
    test('accrueEarnedForInStoreSale returns null when tenantId, enrollment, or orderReference is missing', async () => {
        const repository = makeFakeRepository();
        const enrollment = { enrollment_id: 70, dgfy_account_id: 'acct-70' };
        expect(await accrueEarnedForInStoreSale({ tenantId: null, enrollment, orderReference: 'X', repository })).toBeNull();
        expect(await accrueEarnedForInStoreSale({ tenantId: TENANT_ID, enrollment: null, orderReference: 'X', repository })).toBeNull();
        expect(await accrueEarnedForInStoreSale({ tenantId: TENANT_ID, enrollment, orderReference: null, repository })).toBeNull();
    });

    test('accruePendingForOnlineOrder returns null when tenantId, enrollment, or orderReference is missing', async () => {
        const repository = makeFakeRepository();
        const enrollment = { enrollment_id: 71, dgfy_account_id: 'acct-71' };
        expect(await accruePendingForOnlineOrder({ tenantId: null, enrollment, orderReference: 'X', repository })).toBeNull();
        expect(await accruePendingForOnlineOrder({ tenantId: TENANT_ID, enrollment: null, orderReference: 'X', repository })).toBeNull();
        expect(await accruePendingForOnlineOrder({ tenantId: TENANT_ID, enrollment, orderReference: null, repository })).toBeNull();
    });
});
