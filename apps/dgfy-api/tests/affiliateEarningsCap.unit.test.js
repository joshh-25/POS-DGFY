// #449 (Phase 208) - unit tests for the affiliate lifetime earnings cap: resolveEarningsCap /
// evaluateEarningsCap in affiliateCommissionAccrual.js, and their wiring into
// accrueEarnedForInStoreSale / accruePendingForOnlineOrder.
//
// No database is used: every function under test already takes `repository` as an injectable
// parameter. This mirrors tests/affiliateCommissionAccrual.unit.test.js's fake-repo harness shape
// (copied and extended with sumLifetimeCommissionCentavos), per the plan's §8 pattern.

import { jest } from '@jest/globals';
import logger from '../src/config/logger.js';
import {
    resolveEarningsCap,
    evaluateEarningsCap,
    accrueEarnedForInStoreSale,
    accruePendingForOnlineOrder
} from '../src/modules/dgfy/utils/affiliateCommissionAccrual.js';
import { buildUpdateAffiliateSettingsUseCase } from '../src/modules/dgfy/usecases/dgfyAffiliateUseCases.js';

const TENANT_ID = 'tenant-1';
const CAP_COUNTED_STATUSES = ['pending', 'earned', 'paid'];

const makeFakeRepository = ({
    settings = { program_enabled: true, default_rate_bps: 500 },
    enrollments = [],
    commissions = []
} = {}) => {
    const attributions = [];
    const recordedCommissions = [...commissions];
    const sumCallCount = { value: 0 };

    return {
        __state: { attributions, commissions: recordedCommissions, sumCallCount },

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
            sumCallCount.value += 1;
            return recordedCommissions
                .filter((c) => c.tenant_id === tenantId
                    && String(c.enrollment_id) === String(enrollmentId)
                    && CAP_COUNTED_STATUSES.includes(c.status)
                    && (excludeOrderReference == null || c.order_reference !== String(excludeOrderReference)))
                .reduce((sum, c) => sum + (Number(c.amount_centavos) || 0), 0);
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

describe('resolveEarningsCap — T13, the eight-combination pair-resolution table', () => {
    const PAST = new Date(Date.now() - 86400000);
    const FUTURE = new Date(Date.now() + 86400000);

    test('no enrollment cap, no tenant cap -> null (uncapped)', () => {
        expect(resolveEarningsCap({}, {})).toBeNull();
    });

    test('no enrollment cap, tenant cap set, no date -> tenant pair, not expired', () => {
        const result = resolveEarningsCap({}, { max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null });
        expect(result).toEqual({ capCentavos: 200000, activeUntil: null, source: 'tenant', expired: false });
    });

    test('no enrollment cap, tenant cap set, date in the past -> tenant pair, expired', () => {
        const result = resolveEarningsCap({}, { max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: PAST });
        expect(result).toEqual({ capCentavos: 200000, activeUntil: PAST, source: 'tenant', expired: true });
    });

    test('no enrollment cap, tenant cap set, date in the future -> tenant pair, not expired', () => {
        const result = resolveEarningsCap({}, { max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: FUTURE });
        expect(result).toEqual({ capCentavos: 200000, activeUntil: FUTURE, source: 'tenant', expired: false });
    });

    test('enrollment cap set, no date, tenant cap irrelevant -> enrollment pair, not expired', () => {
        const result = resolveEarningsCap(
            { max_lifetime_earnings_centavos: 1000000, earnings_cap_active_until: null },
            { max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: PAST }
        );
        expect(result).toEqual({ capCentavos: 1000000, activeUntil: null, source: 'enrollment', expired: false });
    });

    test('enrollment cap set, date in the past -> enrollment pair, expired', () => {
        const result = resolveEarningsCap(
            { max_lifetime_earnings_centavos: 1000000, earnings_cap_active_until: PAST },
            { max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null }
        );
        expect(result).toEqual({ capCentavos: 1000000, activeUntil: PAST, source: 'enrollment', expired: true });
    });

    test('enrollment cap set, date in the future -> enrollment pair, not expired', () => {
        const result = resolveEarningsCap(
            { max_lifetime_earnings_centavos: 1000000, earnings_cap_active_until: FUTURE },
            {}
        );
        expect(result).toEqual({ capCentavos: 1000000, activeUntil: FUTURE, source: 'enrollment', expired: false });
    });

    test('enrollment cap NULL explicitly, tenant cap set -> falls through to tenant pair', () => {
        const result = resolveEarningsCap(
            { max_lifetime_earnings_centavos: null, earnings_cap_active_until: FUTURE },
            { max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null }
        );
        expect(result).toEqual({ capCentavos: 200000, activeUntil: null, source: 'tenant', expired: false });
    });
});

describe('evaluateEarningsCap / accrual wiring', () => {
    test('T1 - baseline, no cap configured: written unchanged, sumLifetimeCommissionCentavos never called', async () => {
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: null, earnings_cap_active_until: null },
            enrollments: [enrollment()]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            commissionableBaseCentavos: 10000,
            repository
        });
        expect(commission).not.toBeNull();
        expect(commission.amount_centavos).toBe(500);
        expect(repository.__state.sumCallCount.value).toBe(0);
    });

    test('T2 - under cap: row written, amount_centavos correct, shape unchanged', async () => {
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null },
            enrollments: [enrollment()],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 50000 }]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            commissionableBaseCentavos: 6000, // rate 500bps -> 300
            repository
        });
        expect(commission).not.toBeNull();
        expect(commission.amount_centavos).toBe(300); // 6000 * 500/10000 = 300
    });

    test('T3 - crossing sale, full skip: null, no row, attribution recorded, logger.warn fired', async () => {
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null },
            enrollments: [enrollment()],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 195000 }]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 5001 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(commission).toBeNull();
        expect(repository.__state.commissions).toHaveLength(1); // unchanged
        expect(repository.__state.attributions).toHaveLength(1);
        expect(warnSpy).toHaveBeenCalledWith(
            '[AffiliateCommissionAccrual] Skipped commission: lifetime earnings cap reached',
            expect.objectContaining({ orderReference: 'order-1' })
        );
        warnSpy.mockRestore();
    });

    test('T4 - already at/over cap: null, no row, attribution recorded', async () => {
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null },
            enrollments: [enrollment()],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 200000 }]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 100 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(commission).toBeNull();
        expect(repository.__state.commissions).toHaveLength(1);
        expect(repository.__state.attributions).toHaveLength(1);
    });

    test('T5 - both channels: identical outcome on accruePendingForOnlineOrder', async () => {
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null },
            enrollments: [enrollment()],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 195000 }]
        });
        const commission = await accruePendingForOnlineOrder({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 5001 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(commission).toBeNull();
        expect(repository.__state.commissions).toHaveLength(1);
        expect(repository.__state.attributions).toHaveLength(1);
    });

    test('T6 - per-enrollment override beats tenant default (higher enrollment cap accrues)', async () => {
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null },
            enrollments: [enrollment({ max_lifetime_earnings_centavos: 1000000, earnings_cap_active_until: null })],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 500000 }]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment({ max_lifetime_earnings_centavos: 1000000, earnings_cap_active_until: null }),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 1000 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(commission).not.toBeNull();
    });

    test('T6b - mirror case: lower enrollment cap under a higher tenant cap skips', async () => {
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null },
            enrollments: [enrollment({ max_lifetime_earnings_centavos: 100, earnings_cap_active_until: null })],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 50 }]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment({ max_lifetime_earnings_centavos: 100, earnings_cap_active_until: null }),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 100 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(commission).toBeNull();
    });

    test('T7 - expired end date (A1): accrues normally, uncapped', async () => {
        const yesterday = new Date(Date.now() - 86400000);
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: yesterday },
            enrollments: [enrollment()],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 999900 }]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 500000 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(commission).not.toBeNull();
        expect(commission.amount_centavos).toBe(500000);
    });

    test('T8 - live end date (tomorrow): cap enforced, skips', async () => {
        const tomorrow = new Date(Date.now() + 86400000);
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: tomorrow },
            enrollments: [enrollment()],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 199999 }]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 100 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(commission).toBeNull();
    });

    test('T9 - pair resolution: enrollment cap with null active_until stays live even when tenant expiry is past', async () => {
        const past = new Date(Date.now() - 86400000);
        const cap = resolveEarningsCap(
            { max_lifetime_earnings_centavos: 500000, earnings_cap_active_until: null },
            { max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: past }
        );
        expect(cap).toEqual({ capCentavos: 500000, activeUntil: null, source: 'enrollment', expired: false });
    });

    test('T10 - status accounting: reversed rows excluded from the total', async () => {
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null },
            enrollments: [enrollment()],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'reversed', amount_centavos: 500000 }]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 1000 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(commission).not.toBeNull();
    });

    test('T10b - companion case: the same amount as `pending` (not reversed) skips', async () => {
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null },
            enrollments: [enrollment()],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'pending', amount_centavos: 500000 }]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 1000 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(commission).toBeNull();
    });

    test('T11 - idempotent retry at the boundary: second call returns the existing commission, not null', async () => {
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null },
            enrollments: [enrollment()],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 0 }]
        });
        const first = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 200000 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(first).not.toBeNull();
        expect(first.amount_centavos).toBe(200000);
        expect(repository.__state.commissions).toHaveLength(2);

        const second = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 200000 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(second).not.toBeNull();
        expect(second.commission_id).toBe(first.commission_id);
        expect(repository.__state.commissions).toHaveLength(2); // no new row
    });

    test('T12 - zero-amount accrual at an exactly-reached cap: row IS written (no >= simplification)', async () => {
        const repository = makeFakeRepository({
            settings: { program_enabled: true, default_rate_bps: 500, max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null },
            enrollments: [enrollment()],
            commissions: [{ tenant_id: TENANT_ID, enrollment_id: 1, order_reference: 'order-0', status: 'earned', amount_centavos: 200000 }]
        });
        const commission = await accrueEarnedForInStoreSale({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            orderReference: 'order-1',
            resolvedCommission: { rateBps: 0, amountCentavos: 0 },
            commissionableBaseCentavos: 0,
            repository
        });
        expect(commission).not.toBeNull();
        expect(commission.amount_centavos).toBe(0);
    });

    test('evaluateEarningsCap directly - expired cap logs info and returns skip: false', async () => {
        const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
        const repository = makeFakeRepository();
        const past = new Date(Date.now() - 86400000);
        const result = await evaluateEarningsCap({
            tenantId: TENANT_ID,
            enrollment: enrollment(),
            settings: { max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: past },
            amountCentavos: 999999999,
            repository
        });
        expect(result.skip).toBe(false);
        expect(result.expired).toBe(true);
        expect(infoSpy).toHaveBeenCalledWith(
            '[AffiliateCommissionAccrual] Earnings cap expired; accruing uncapped',
            expect.objectContaining({ tenantId: TENANT_ID })
        );
        infoSpy.mockRestore();
    });
});

// #449 (Phase 208), §8.2 - tenant-settings validation for the two new cap fields on
// buildUpdateAffiliateSettingsUseCase. Kept in this file rather than
// dgfyAffiliatePriceRuleUseCases.unit.test.js, whose own header scopes it to the Phase 1 pricing
// rule engine.
describe('buildUpdateAffiliateSettingsUseCase — earnings cap fields (#449 Phase 208)', () => {
    const makeSettingsRepository = (initial = {}) => {
        const state = { settings: { max_lifetime_earnings_centavos: null, earnings_cap_active_until: null, ...initial } };
        return {
            __state: state,
            async getSettings() {
                return state.settings;
            },
            async upsertSettings(tenantId, updates) {
                Object.assign(state.settings, updates);
                return { tenant_id: tenantId, ...state.settings };
            }
        };
    };

    test('accepts a positive integer cap and a valid ISO date together', async () => {
        const repository = makeSettingsRepository();
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { max_lifetime_earnings_centavos: 300000, earnings_cap_active_until: '2026-12-31T00:00:00.000Z' }
        });
        expect(result.success).toBe(true);
        expect(result.data.settings.max_lifetime_earnings_centavos).toBe(300000);
    });

    test('explicit null clears a previously-set cap', async () => {
        const repository = makeSettingsRepository({ max_lifetime_earnings_centavos: 300000, earnings_cap_active_until: null });
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { max_lifetime_earnings_centavos: null }
        });
        expect(result.success).toBe(true);
        expect(result.data.settings.max_lifetime_earnings_centavos).toBeNull();
    });

    test('an invalid earnings_cap_active_until is rejected with 422', async () => {
        const repository = makeSettingsRepository({ max_lifetime_earnings_centavos: 300000 });
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { earnings_cap_active_until: 'not-a-date' }
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('§2.3 guard - a date with no cap configured at all is rejected 422 EARNINGS_CAP_DATE_WITHOUT_CAP', async () => {
        const repository = makeSettingsRepository();
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { earnings_cap_active_until: '2026-12-31T00:00:00.000Z' }
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details).toMatchObject({ reason_code: 'EARNINGS_CAP_DATE_WITHOUT_CAP' });
    });

    test('§2.3 guard is computed against the PATCH-merged state, not the payload alone: an existing cap makes a date-only PATCH valid', async () => {
        const repository = makeSettingsRepository({ max_lifetime_earnings_centavos: 300000, earnings_cap_active_until: null });
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { earnings_cap_active_until: '2026-12-31T00:00:00.000Z' }
        });
        expect(result.success).toBe(true);
    });

    test('a settings PATCH that never touches either cap field never calls getSettings', async () => {
        const repository = makeSettingsRepository();
        const getSettingsSpy = jest.spyOn(repository, 'getSettings');
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { program_enabled: true }
        });
        expect(result.success).toBe(true);
        expect(getSettingsSpy).not.toHaveBeenCalled();
    });
});
