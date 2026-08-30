// #448 (Phase 209) - unit tests for the per-category affiliate commission rate ladder:
// resolveCategoryRateBps / resolveLineCommissionRateBps / loadApplicableCategoryRates /
// computeCategoryAwareCommission in affiliateCommissionAccrual.js, and their wiring into
// accrueEarnedForInStoreSale / accruePendingForOnlineOrder. See PHASE_209_PLAN.md §9 for the full
// case list this file implements.
//
// No database is used: every function under test already takes `repository` as an injectable
// parameter. Fake-repository harness copied from tests/affiliateEarningsCap.unit.test.js (itself
// copied from tests/affiliateCommissionAccrual.unit.test.js) and extended with
// listActiveCategoryRatesForEnrollment.

import {
    resolveCategoryRateBps,
    resolveLineCommissionRateBps,
    loadApplicableCategoryRates,
    computeCategoryAwareCommission,
    accrueEarnedForInStoreSale,
    allocateLargestRemainder
} from '../src/modules/dgfy/utils/affiliateCommissionAccrual.js';

const TENANT_ID = 'tenant-1';
const CAP_COUNTED_STATUSES = ['pending', 'earned', 'paid'];

const makeFakeRepository = ({
    settings = { program_enabled: true, default_rate_bps: 500, category_rates_enabled: true },
    enrollments = [],
    commissions = [],
    categoryRates = []
} = {}) => {
    const attributions = [];
    const recordedCommissions = [...commissions];
    const listCallCount = { value: 0 };

    return {
        __state: { attributions, commissions: recordedCommissions, listCallCount },

        async getSettings() {
            return settings;
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

        async sumLifetimeCommissionCentavos(tenantId, enrollmentId, { excludeOrderReference = null } = {}) {
            return recordedCommissions
                .filter((c) => c.tenant_id === tenantId
                    && String(c.enrollment_id) === String(enrollmentId)
                    && CAP_COUNTED_STATUSES.includes(c.status)
                    && (excludeOrderReference == null || c.order_reference !== String(excludeOrderReference)))
                .reduce((sum, c) => sum + (Number(c.amount_centavos) || 0), 0);
        },

        async listActiveCategoryRatesForEnrollment(tenantId, enrollmentId) {
            listCallCount.value += 1;
            return categoryRates.filter((row) => (
                row.tenant_id === tenantId
                && row.active !== false
                && (Number(row.enrollment_id) === Number(enrollmentId) || Number(row.enrollment_id) === 0)
            ));
        }
    };
};

const enrollment = (overrides = {}) => ({
    enrollment_id: 1,
    tenant_id: TENANT_ID,
    dgfy_account_id: 'acct-1',
    status: 'active',
    ...overrides
});

const categoryRateRow = (overrides = {}) => ({
    category_rate_id: 1,
    tenant_id: TENANT_ID,
    enrollment_id: 0,
    folder_id: 10,
    rate_bps: 2000,
    active: true,
    ...overrides
});

describe('resolveCategoryRateBps — pure resolver', () => {
    test('1. enrollment-scoped row beats the enrollment_id=0 template row for the same folder', () => {
        const rows = [
            categoryRateRow({ category_rate_id: 1, enrollment_id: 0, folder_id: 10, rate_bps: 2000 }),
            categoryRateRow({ category_rate_id: 2, enrollment_id: 1, folder_id: 10, rate_bps: 3000 })
        ];
        expect(resolveCategoryRateBps(rows, 10)).toBe(3000);
    });

    test('2. returns null for an unmatched folderId, and for folderId === null', () => {
        const rows = [categoryRateRow({ folder_id: 10, rate_bps: 2000 })];
        expect(resolveCategoryRateBps(rows, 999)).toBeNull();
        expect(resolveCategoryRateBps(rows, null)).toBeNull();
    });

    test('3. ignores active: false rows', () => {
        const rows = [categoryRateRow({ folder_id: 10, rate_bps: 2000, active: false })];
        expect(resolveCategoryRateBps(rows, 10)).toBeNull();
    });
});

describe('The ladder — resolveLineCommissionRateBps / loadApplicableCategoryRates', () => {
    test('4. category rate applies when set and the enrollment has no commission_rate_bps', () => {
        const settings = { default_rate_bps: 500 };
        const rows = [categoryRateRow({ folder_id: 10, rate_bps: 2000 })];
        const result = resolveLineCommissionRateBps(enrollment({ commission_rate_bps: null }), settings, rows, 10);
        expect(result).toBe(2000);
    });

    test('5. enrollment override still wins over a category rate, and loadApplicableCategoryRates returns [] without calling the repository', async () => {
        const settings = { default_rate_bps: 500, category_rates_enabled: true };
        const rows = [categoryRateRow({ folder_id: 10, rate_bps: 2000 })];
        const overriddenEnrollment = enrollment({ commission_rate_bps: 800 });

        // Pure-resolver check: even if rows were somehow passed in, the override wins outright.
        expect(resolveLineCommissionRateBps(overriddenEnrollment, settings, rows, 10)).toBe(800);

        // Wiring check: the async loader short-circuits to [] and never queries the repository.
        const repository = makeFakeRepository({ settings, enrollments: [overriddenEnrollment], categoryRates: rows });
        const loaded = await loadApplicableCategoryRates({
            tenantId: TENANT_ID,
            enrollment: overriddenEnrollment,
            settings,
            repository
        });
        expect(loaded).toEqual([]);
        expect(repository.__state.listCallCount.value).toBe(0);
    });

    test('6. no category rate -> tenant default, unchanged (regression baseline)', () => {
        const settings = { default_rate_bps: 500 };
        const result = resolveLineCommissionRateBps(enrollment({ commission_rate_bps: null }), settings, [], 10);
        expect(result).toBe(500);
    });

    test('7. category_rates_enabled: false -> zero repository calls, result identical to case 6 even with matching rows present', async () => {
        const settings = { default_rate_bps: 500, category_rates_enabled: false };
        const rows = [categoryRateRow({ folder_id: 10, rate_bps: 2000 })];
        const activeEnrollment = enrollment({ commission_rate_bps: null });
        const repository = makeFakeRepository({ settings, enrollments: [activeEnrollment], categoryRates: rows });

        const loaded = await loadApplicableCategoryRates({
            tenantId: TENANT_ID,
            enrollment: activeEnrollment,
            settings,
            repository
        });
        expect(loaded).toEqual([]);
        expect(repository.__state.listCallCount.value).toBe(0);
        expect(resolveLineCommissionRateBps(activeEnrollment, settings, loaded, 10)).toBe(500);
    });
});

describe('computeCategoryAwareCommission — §5.2, the multi-category decision under test', () => {
    test('8. mixed cart, two categories, different rates: exact amountCentavos and blended rateBpsSnapshot', () => {
        // B = 10000 centavos. Line A: folder 10 (rate 2000bps=20%), weight 6000. Line B: folder 20
        // (rate 1000bps=10%), weight 4000. Largest-remainder split of 10000 by weights 6000/4000
        // (total 10000) is exact: Ba = 6000, Bb = 4000 (no remainder to distribute).
        // amount = round(6000*2000/10000) + round(4000*1000/10000) = 1200 + 400 = 1600.
        // rateBpsSnapshot = round(1600*10000/10000) = 1600.
        const rows = [
            categoryRateRow({ category_rate_id: 1, enrollment_id: 0, folder_id: 10, rate_bps: 2000 }),
            categoryRateRow({ category_rate_id: 2, enrollment_id: 0, folder_id: 20, rate_bps: 1000 })
        ];
        const result = computeCategoryAwareCommission({
            enrollment: enrollment({ commission_rate_bps: null }),
            settings: { default_rate_bps: 500 },
            categoryRateRows: rows,
            lines: [
                { folderId: 10, weightCentavos: 6000 },
                { folderId: 20, weightCentavos: 4000 }
            ],
            commissionableBaseCentavos: 10000
        });
        expect(result.amountCentavos).toBe(1600);
        expect(result.rateBpsSnapshot).toBe(1600);
    });

    test('9. uniform-rate collapse: multi-line cart, every line resolves to the same rate -> byte-identical to round(B*r/10000)', () => {
        const rows = [categoryRateRow({ folder_id: 10, rate_bps: 2000 })];
        const B = 12345;
        const r = 2000;
        const result = computeCategoryAwareCommission({
            enrollment: enrollment({ commission_rate_bps: null }),
            settings: { default_rate_bps: 500 },
            categoryRateRows: rows,
            lines: [
                { folderId: 10, weightCentavos: 7000 },
                { folderId: 10, weightCentavos: 3000 },
                { folderId: 10, weightCentavos: 2000 }
            ],
            commissionableBaseCentavos: B
        });
        // Literal expression, not a recomputation - this is the exact pre-Phase-209 formula.
        expect(result.amountCentavos).toBe(Math.round(B * r / 10000));
        expect(result.rateBpsSnapshot).toBe(r);
    });

    test('10. allocation totals exactly: sum(Bi) === B on a base that does not divide evenly, with the expected remainder ordering', () => {
        // B = 10001, weights 3333/3333/3334 (total 10000). raw = weight*B/totalWeight:
        // 3333.3333 / 3333.3333 / 3334.3334. Floored: 3333/3333/3334, summing to 10000 - one
        // centavo of remainder left to distribute. Fractional remainders: .3333/.3333/.3334, so
        // index 2 has the single largest fraction and gets the +1 (the tie-break-by-ascending-index
        // rule never triggers here since index 2's fraction is strictly larger, not tied).
        const B = 10001;
        const weights = [3333, 3333, 3334];

        const allocatedBases = allocateLargestRemainder(B, weights);

        // The property under test: the allocation sums back to the original base exactly, on a
        // base that does NOT divide evenly across the weights.
        expect(allocatedBases.reduce((sum, v) => sum + v, 0)).toBe(B);
        // The expected remainder distribution, not just its sum - pins the tie/ordering behavior.
        expect(allocatedBases).toEqual([3333, 3333, 3335]);

        // Same property, exercised through the public entry point rather than the allocator
        // directly, so a future refactor that stops calling allocateLargestRemainder internally
        // would still be caught here.
        const rows = [
            categoryRateRow({ category_rate_id: 1, enrollment_id: 0, folder_id: 10, rate_bps: 2000 }),
            categoryRateRow({ category_rate_id: 2, enrollment_id: 0, folder_id: 20, rate_bps: 1000 }),
            categoryRateRow({ category_rate_id: 3, enrollment_id: 0, folder_id: 30, rate_bps: 500 })
        ];
        const lines = [
            { folderId: 10, weightCentavos: weights[0] },
            { folderId: 20, weightCentavos: weights[1] },
            { folderId: 30, weightCentavos: weights[2] }
        ];
        const expectedAmountCentavos = allocatedBases.reduce((sum, lineBase, index) => (
            sum + Math.round(lineBase * [2000, 1000, 500][index] / 10000)
        ), 0);
        const result = computeCategoryAwareCommission({
            enrollment: enrollment({ commission_rate_bps: null }),
            settings: { default_rate_bps: 500 },
            categoryRateRows: rows,
            lines,
            commissionableBaseCentavos: B
        });
        expect(result.amountCentavos).toBe(expectedAmountCentavos);
        expect(Number.isInteger(result.amountCentavos)).toBe(true);
    });

    test('11. uncategorized line (folderId: null) in an otherwise-categorized cart takes the tenant default for its share', () => {
        const rows = [categoryRateRow({ folder_id: 10, rate_bps: 2000 })];
        const result = computeCategoryAwareCommission({
            enrollment: enrollment({ commission_rate_bps: null }),
            settings: { default_rate_bps: 500 },
            categoryRateRows: rows,
            lines: [
                { folderId: 10, weightCentavos: 5000 },
                { folderId: null, weightCentavos: 5000 }
            ],
            commissionableBaseCentavos: 10000
        });
        // Ba = 5000 @ 2000bps = 1000; Bb = 5000 @ 500bps (tenant default) = 250. Total = 1250.
        expect(result.amountCentavos).toBe(1250);
    });

    test('12. degenerate: all weights 0, and empty lines - falls back to the single-rate formula, no throw', () => {
        const settings = { default_rate_bps: 500 };
        const rows = [categoryRateRow({ folder_id: 10, rate_bps: 2000 })];

        expect(() => computeCategoryAwareCommission({
            enrollment: enrollment({ commission_rate_bps: null }),
            settings,
            categoryRateRows: rows,
            lines: [],
            commissionableBaseCentavos: 10000
        })).not.toThrow();
        const emptyResult = computeCategoryAwareCommission({
            enrollment: enrollment({ commission_rate_bps: null }),
            settings,
            categoryRateRows: rows,
            lines: [],
            commissionableBaseCentavos: 10000
        });
        expect(emptyResult.amountCentavos).toBe(500); // round(10000*500/10000)
        expect(emptyResult.rateBpsSnapshot).toBe(500);

        const zeroWeightResult = computeCategoryAwareCommission({
            enrollment: enrollment({ commission_rate_bps: null }),
            settings,
            categoryRateRows: rows,
            lines: [{ folderId: 10, weightCentavos: 0 }, { folderId: 20, weightCentavos: 0 }],
            commissionableBaseCentavos: 10000
        });
        expect(zeroWeightResult.amountCentavos).toBe(500);
        expect(zeroWeightResult.rateBpsSnapshot).toBe(500);
    });
});

describe('Wiring — accrueEarnedForInStoreSale', () => {
    test('13. with commissionLines, writes one row carrying the blended rate_bps_snapshot and unchanged commissionable_base_centavos', async () => {
        const settings = { program_enabled: true, default_rate_bps: 500, category_rates_enabled: true };
        const rows = [
            categoryRateRow({ category_rate_id: 1, enrollment_id: 0, folder_id: 10, rate_bps: 2000 }),
            categoryRateRow({ category_rate_id: 2, enrollment_id: 0, folder_id: 20, rate_bps: 1000 })
        ];
        const activeEnrollment = enrollment({ commission_rate_bps: null });
        const repository = makeFakeRepository({ settings, enrollments: [activeEnrollment], categoryRates: rows });

        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: activeEnrollment,
            orderReference: 'order-cat-1',
            commissionableBaseCentavos: 10000,
            commissionLines: [
                { folderId: 10, weightCentavos: 6000 },
                { folderId: 20, weightCentavos: 4000 }
            ],
            repository
        });

        expect(commission).not.toBeNull();
        expect(commission.commissionable_base_centavos).toBe(10000); // unchanged
        expect(commission.amount_centavos).toBe(1600); // same arithmetic as case 8
        expect(commission.rate_bps_snapshot).toBe(1600);
    });

    test('14. without commissionLines (every caller on develop today) is unchanged', async () => {
        const settings = { program_enabled: true, default_rate_bps: 500, category_rates_enabled: true };
        const activeEnrollment = enrollment({ commission_rate_bps: null });
        const repository = makeFakeRepository({ settings, enrollments: [activeEnrollment], categoryRates: [] });

        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: activeEnrollment,
            orderReference: 'order-nocat-1',
            commissionableBaseCentavos: 10000,
            repository
        });

        expect(commission).not.toBeNull();
        expect(commission.amount_centavos).toBe(500); // 10000 * 500/10000, the pre-Phase-209 formula
        expect(commission.rate_bps_snapshot).toBe(500);
        expect(repository.__state.listCallCount.value).toBe(0); // never touched the new query path
    });

    test('15. resolvedCommission still bypasses the whole ladder (the Phase 1 contract)', async () => {
        const settings = { program_enabled: true, default_rate_bps: 500, category_rates_enabled: true };
        const rows = [categoryRateRow({ folder_id: 10, rate_bps: 2000 })];
        const activeEnrollment = enrollment({ commission_rate_bps: null });
        const repository = makeFakeRepository({ settings, enrollments: [activeEnrollment], categoryRates: rows });

        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: activeEnrollment,
            orderReference: 'order-bypass-1',
            commissionableBaseCentavos: 10000,
            resolvedCommission: { rateBps: 999, amountCentavos: 4242 },
            commissionLines: [{ folderId: 10, weightCentavos: 10000 }], // present but must be ignored
            repository
        });

        expect(commission.amount_centavos).toBe(4242);
        expect(commission.rate_bps_snapshot).toBe(999);
        expect(repository.__state.listCallCount.value).toBe(0); // the category ladder was never entered
    });

    test('16. Phase 208 interaction: the cap compares against the BLENDED amount - a mixed-cart accrual that crosses the cap is still fully skipped', async () => {
        const settings = {
            program_enabled: true,
            default_rate_bps: 500,
            category_rates_enabled: true,
            max_lifetime_earnings_centavos: 2000,
            earnings_cap_active_until: null
        };
        const rows = [
            categoryRateRow({ category_rate_id: 1, enrollment_id: 0, folder_id: 10, rate_bps: 2000 }),
            categoryRateRow({ category_rate_id: 2, enrollment_id: 0, folder_id: 20, rate_bps: 1000 })
        ];
        const activeEnrollment = enrollment({ commission_rate_bps: null });
        const repository = makeFakeRepository({
            settings,
            enrollments: [activeEnrollment],
            categoryRates: rows,
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 1000 }]
        });

        // Same mixed cart as case 8/13 - blended amount is 1600. lifetime already earned is 1000,
        // so 1000 + 1600 = 2600 > cap of 2000: full skip.
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: activeEnrollment,
            orderReference: 'order-cat-cap-1',
            commissionableBaseCentavos: 10000,
            commissionLines: [
                { folderId: 10, weightCentavos: 6000 },
                { folderId: 20, weightCentavos: 4000 }
            ],
            repository
        });

        expect(commission).toBeNull();
        expect(repository.__state.commissions).toHaveLength(1); // unchanged - no new row written
        expect(repository.__state.attributions).toHaveLength(1); // attribution still recorded
    });
});
