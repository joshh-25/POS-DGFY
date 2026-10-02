import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildGetBusinessAdminPosActivityAnalyticsUseCase } from '../src/modules/businessAdmin/usecases/businessAdminPosActivityUseCase.js';
import {
    buildCompletePosActivityWeekdayHourProfile,
    buildPosActivityDailySeries,
    countPosActivityWeekdayOccurrences,
    rankPosActivityQuietPeriods
} from '../src/modules/businessAdmin/domain/businessAdminPosActivityProfile.js';
import { buildBusinessAdminPosActivityScope } from '../src/modules/businessAdmin/repositories/businessAdminPosActivityRepository.js';

const overviewRepository = { listUserLocationGrantIds: jest.fn() };
const activityRepository = { getActivityAnalytics: jest.fn() };

const useCase = buildGetBusinessAdminPosActivityAnalyticsUseCase({
    businessAdminOverviewRepository: overviewRepository,
    businessAdminPosActivityRepository: activityRepository
});

const adminUser = { role: 'admin', user_id: 1 };
const scopedUser = { role: 'manager', user_id: 9, permissions: ['business_admin:access'] };

const analyticsPayload = {
    daily: [],
    totals: { qualifying_sales: 4, payment_total: 1200 },
    customers: { distinct_linked_customers: 3, unlinked_transaction_count: 1 },
    weekday_hour_profile: [],
    quiet_periods: []
};

beforeEach(() => {
    overviewRepository.listUserLocationGrantIds.mockReset();
    activityRepository.getActivityAnalytics.mockReset();
    activityRepository.getActivityAnalytics.mockResolvedValue(analyticsPayload);
});

describe('Business Admin POS activity analytics use case (#2193)', () => {
    it('accepts a valid range and defaults missing dates to Manila today', async () => {
        const result = await useCase({ query: { date_from: '2026-09-01', date_to: '2026-09-07' }, user: adminUser });

        expect(result.success).toBe(true);
        expect(activityRepository.getActivityAnalytics).toHaveBeenCalledWith(expect.objectContaining({
            dateFrom: '2026-09-01',
            dateTo: '2026-09-07',
            branchId: null,
            allowedLocationIds: null
        }));
        expect(result.data.meta).toMatchObject({ timezone: 'Asia/Manila', scope: 'all' });
        expect(result.data.definitions.qualifying_sale).toMatch(/Split-tender/);
        expect(result.data.guidance.historical_only).toMatch(/planning guidance only/i);
    });

    it('rejects invalid and overlong ranges', async () => {
        const invalid = await useCase({ query: { date_from: 'not-a-date' }, user: adminUser });
        expect(invalid.success).toBe(false);
        expect(invalid.error.details).toMatchObject({ reason_code: 'BUSINESS_ADMIN_INVALID_DATE' });

        const reversed = await useCase({ query: { date_from: '2026-09-07', date_to: '2026-09-01' }, user: adminUser });
        expect(reversed.success).toBe(false);

        const overlong = await useCase({ query: { date_from: '2025-01-01', date_to: '2026-09-30' }, user: adminUser });
        expect(overlong.success).toBe(false);
        expect(overlong.error.details).toMatchObject({ reason_code: 'BUSINESS_ADMIN_REPORT_DATE_RANGE_EXCEEDED' });
        expect(activityRepository.getActivityAnalytics).not.toHaveBeenCalled();
    });

    it('rejects non-positive branch filters', async () => {
        const result = await useCase({ query: { branch_id: 'abc' }, user: adminUser });
        expect(result.success).toBe(false);
        expect(result.error.details).toMatchObject({ reason_code: 'BUSINESS_ADMIN_INVALID_BRANCH_ID' });
    });

    it('denies Business Admin access for cashiers', async () => {
        const result = await useCase({ query: {}, user: { role: 'cashier', user_id: 3 } });
        expect(result.success).toBe(false);
        expect(result.error.details).toMatchObject({ reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });
        expect(activityRepository.getActivityAnalytics).not.toHaveBeenCalled();
    });

    it('scopes assigned users to their location grants and rejects unauthorized branches', async () => {
        overviewRepository.listUserLocationGrantIds.mockResolvedValue([12]);

        const allowed = await useCase({ query: { branch_id: '12' }, user: scopedUser });
        expect(allowed.success).toBe(true);
        expect(activityRepository.getActivityAnalytics).toHaveBeenCalledWith(expect.objectContaining({
            branchId: 12,
            allowedLocationIds: [12]
        }));

        const denied = await useCase({ query: { branch_id: '99' }, user: scopedUser });
        expect(denied.success).toBe(false);
        expect(denied.error.details).toMatchObject({ reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' });
    });

    it('requires assigned users to hold at least one location grant', async () => {
        overviewRepository.listUserLocationGrantIds.mockResolvedValue([]);
        const result = await useCase({ query: {}, user: scopedUser });
        expect(result.success).toBe(false);
        expect(result.error.details).toMatchObject({ reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' });
    });

    it('exposes no customer PII in the analytics contract', async () => {
        const result = await useCase({ query: { date_from: '2026-09-01', date_to: '2026-09-02' }, user: adminUser });
        const serialized = JSON.stringify(result.data);
        expect(serialized).not.toMatch(/customer_name|customer_email|customer_phone/);
        expect(result.data.customers).toEqual({ distinct_linked_customers: 3, unlinked_transaction_count: 1 });
    });
});

describe('POS activity scope and profile math (#2193)', () => {
    it('counts one completed paid sale per transaction and excludes voided, refunded, and non-finalized online activity', () => {
        const scope = buildBusinessAdminPosActivityScope({ dateFrom: '2026-09-01', dateTo: '2026-09-02', branchId: null, allowedLocationIds: null });
        expect(scope.where).toContain("t.status = 'completed'");
        expect(scope.where).toContain("t.payment_status = 'paid'");
        expect(scope.where).toContain("t.order_source = 'in_store'");
        expect(scope.where).toContain("t.fulfillment_status = 'completed'");
        // Transaction-row counting keeps split-tender sales at one row each.
        expect(scope.where).not.toContain('pos_order_payments');
        expect(scope.where).not.toContain('pos_payment_allocations');
    });

    it('applies the server-derived branch authorization before querying', () => {
        const scoped = buildBusinessAdminPosActivityScope({ dateFrom: '2026-09-01', dateTo: '2026-09-02', branchId: 12, allowedLocationIds: [12] });
        expect(scoped.where).toContain('t.location_id = :branchId');
        expect(scoped.replacements.branchId).toBe(12);

        const assigned = buildBusinessAdminPosActivityScope({ dateFrom: '2026-09-01', dateTo: '2026-09-02', branchId: null, allowedLocationIds: [12, 13] });
        expect(assigned.where).toContain('t.location_id IN (:allowedLocationIds)');
    });

    it('builds a complete 168-slot weekday/hour profile including zero-activity slots', () => {
        const profile = buildCompletePosActivityWeekdayHourProfile({
            slotAggregates: [{ weekday: 0, hour: 9, sale_count: 8, payment_total: 1600, distinct_customer_count: 5 }],
            dateFrom: '2026-09-01',
            dateTo: '2026-09-07'
        });
        expect(profile).toHaveLength(168);
        const active = profile.find((slot) => slot.weekday === 0 && slot.hour === 9);
        expect(active.sale_count).toBe(8);
        expect(active.occurrences).toBe(1);
        expect(active.avg_sales_per_occurrence).toBe(8);
        const zero = profile.find((slot) => slot.weekday === 1 && slot.hour === 3);
        expect(zero.sale_count).toBe(0);
        expect(zero.occurrences).toBe(1);
    });

    it('ranks quiet periods by average sales per weekday occurrence', () => {
        const profile = buildCompletePosActivityWeekdayHourProfile({
            slotAggregates: [
                { weekday: 0, hour: 9, sale_count: 8, payment_total: 1600, distinct_customer_count: 5 },
                { weekday: 2, hour: 14, sale_count: 2, payment_total: 400, distinct_customer_count: 2 }
            ],
            dateFrom: '2026-09-01',
            dateTo: '2026-09-14'
        });
        const ranked = rankPosActivityQuietPeriods(profile, 3);
        expect(ranked).toHaveLength(3);
        expect(ranked[0].rank).toBe(1);
        expect(ranked[0].sale_count).toBe(0);
        // The busiest slot sorts after quieter ones.
        expect(ranked.find((slot) => slot.weekday === 0 && slot.hour === 9)).toBeUndefined();
        expect(countPosActivityWeekdayOccurrences('2026-09-01', '2026-09-14')[0]).toBe(2);
    });

    it('fills daily gaps with zero-activity Manila business dates', () => {
        const daily = buildPosActivityDailySeries({
            dailyAggregates: [{ business_date: '2026-09-01', sale_count: 3, payment_total: 900 }],
            dateFrom: '2026-09-01',
            dateTo: '2026-09-03'
        });
        expect(daily.map((row) => row.business_date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
        expect(daily[1]).toMatchObject({ sale_count: 0, payment_total: 0 });
    });
});
