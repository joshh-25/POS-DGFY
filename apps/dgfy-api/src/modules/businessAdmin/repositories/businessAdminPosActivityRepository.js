import { QueryTypes } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import {
    buildCompletePosActivityWeekdayHourProfile,
    buildPosActivityDailySeries,
    rankPosActivityQuietPeriods
} from '../domain/businessAdminPosActivityProfile.js';

const toBusinessDateBoundary = (date, includeNextDay = false) => {
    const boundary = new Date(`${date}T00:00:00.000+08:00`);
    if (includeNextDay) boundary.setUTCDate(boundary.getUTCDate() + 1);
    return boundary.toISOString().slice(0, 19).replace('T', ' ');
};

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const toInt = (value) => Number.parseInt(value, 10) || 0;

// Qualifying activity is one completed, paid POS sale per transaction row:
// status completed (excludes voided), payment_status paid (excludes unpaid,
// partially-paid, pending, failed, and refund-related states), and the
// canonical financially-recognized source rule (in-store, plus online only
// when fulfillment completed). Counting transaction rows — never payment
// allocations or lines — keeps split-tender sales at exactly one sale and one
// persisted total_amount.
const scopedActivity = ({ dateFrom, dateTo, branchId = null, allowedLocationIds = null }) => {
    const replacements = {
        startAt: toBusinessDateBoundary(dateFrom),
        endAt: toBusinessDateBoundary(dateTo, true)
    };
    const predicates = [
        't.created_at >= :startAt',
        't.created_at < :endAt',
        "t.status = 'completed'",
        "t.payment_status = 'paid'",
        "(t.order_source = 'in_store' OR t.order_source IS NULL OR (t.order_source = 'online_store' AND t.fulfillment_status = 'completed'))"
    ];
    if (branchId) {
        replacements.branchId = branchId;
        predicates.push('t.location_id = :branchId');
    } else if (Array.isArray(allowedLocationIds)) {
        replacements.allowedLocationIds = allowedLocationIds;
        predicates.push('t.location_id IN (:allowedLocationIds)');
    }
    return { replacements, where: predicates.join('\n        AND ') };
};

export const businessAdminPosActivityRepository = {
    async getActivityAnalytics({ dateFrom, dateTo, branchId = null, allowedLocationIds = null } = {}) {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const scope = scopedActivity({ dateFrom, dateTo, branchId, allowedLocationIds });

        const [dailyRows, customerRows, slotRows] = await Promise.all([
            sequelize.query(
                `SELECT DATE_FORMAT(DATE_ADD(t.created_at, INTERVAL 8 HOUR), '%Y-%m-%d') AS business_date,
                    COUNT(*) AS sale_count,
                    COALESCE(SUM(t.total_amount), 0) AS payment_total
                FROM pos_transactions t
                WHERE ${scope.where}
                GROUP BY business_date
                ORDER BY business_date ASC`,
                { replacements: scope.replacements, type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT COUNT(*) AS qualifying_sales,
                    COALESCE(SUM(t.total_amount), 0) AS payment_total,
                    COUNT(DISTINCT t.store_customer_id) AS distinct_linked_customers,
                    COALESCE(SUM(CASE WHEN t.store_customer_id IS NULL THEN 1 ELSE 0 END), 0) AS unlinked_transaction_count
                FROM pos_transactions t
                WHERE ${scope.where}`,
                { replacements: scope.replacements, type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT WEEKDAY(DATE_ADD(t.created_at, INTERVAL 8 HOUR)) AS weekday,
                    HOUR(DATE_ADD(t.created_at, INTERVAL 8 HOUR)) AS hour,
                    COUNT(*) AS sale_count,
                    COALESCE(SUM(t.total_amount), 0) AS payment_total,
                    COUNT(DISTINCT t.store_customer_id) AS distinct_customer_count
                FROM pos_transactions t
                WHERE ${scope.where}
                GROUP BY weekday, hour`,
                { replacements: scope.replacements, type: QueryTypes.SELECT }
            )
        ]);

        const daily = buildPosActivityDailySeries({ dailyAggregates: dailyRows, dateFrom, dateTo });
        const customerRow = customerRows[0] || {};
        const qualifyingSales = toInt(customerRow.qualifying_sales);
        const slotAggregates = (slotRows || []).map((row) => ({
            weekday: toInt(row.weekday),
            hour: toInt(row.hour),
            sale_count: toInt(row.sale_count),
            payment_total: number(row.payment_total),
            distinct_customer_count: toInt(row.distinct_customer_count)
        }));
        const weekdayHourProfile = buildCompletePosActivityWeekdayHourProfile({ slotAggregates, dateFrom, dateTo });

        return {
            daily,
            totals: {
                qualifying_sales: qualifyingSales,
                payment_total: number(customerRow.payment_total)
            },
            customers: {
                // Distinct linked tenant profiles only; transaction snapshots
                // are never merged into an inferred identity.
                distinct_linked_customers: toInt(customerRow.distinct_linked_customers),
                unlinked_transaction_count: toInt(customerRow.unlinked_transaction_count)
            },
            weekday_hour_profile: weekdayHourProfile,
            quiet_periods: rankPosActivityQuietPeriods(weekdayHourProfile)
        };
    }
};

export { scopedActivity as buildBusinessAdminPosActivityScope };
