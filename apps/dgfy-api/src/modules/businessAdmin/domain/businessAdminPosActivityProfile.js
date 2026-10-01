const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const POS_ACTIVITY_WEEKDAY_LABELS = Object.freeze([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
]);

export const POS_ACTIVITY_QUIET_PERIOD_LIMIT = 10;

export const formatPosActivityHourLabel = (hour) => {
    const normalized = Number(hour);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > 23) return '';
    if (normalized === 0) return '12 AM';
    if (normalized < 12) return `${normalized} AM`;
    if (normalized === 12) return '12 PM';
    return `${normalized - 12} PM`;
};

export const listPosActivityDateKeys = (dateFrom, dateTo) => {
    if (!DATE_ONLY_PATTERN.test(String(dateFrom || '')) || !DATE_ONLY_PATTERN.test(String(dateTo || ''))) return [];
    if (String(dateFrom) > String(dateTo)) return [];
    const keys = [];
    let cursor = `${dateFrom}T00:00:00.000Z`;
    let current = new Date(cursor);
    const end = new Date(`${dateTo}T00:00:00.000Z`);
    let guard = 0;
    while (current <= end && guard < 400) {
        keys.push(current.toISOString().slice(0, 10));
        current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
        guard += 1;
    }
    return keys;
};

// The date keys passed here are already Manila calendar dates, so the weekday
// is derived from the calendar date itself (midday UTC avoids DST-free offset
// edge cases; Asia/Manila has no DST).
export const posActivityWeekdayIndexOfDateKey = (dateKey) => {
    if (!DATE_ONLY_PATTERN.test(String(dateKey || ''))) return null;
    const day = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
    if (!Number.isInteger(day)) return null;
    return (day + 6) % 7;
};

export const countPosActivityWeekdayOccurrences = (dateFrom, dateTo) => {
    const occurrences = [0, 0, 0, 0, 0, 0, 0];
    for (const key of listPosActivityDateKeys(dateFrom, dateTo)) {
        const weekday = posActivityWeekdayIndexOfDateKey(key);
        if (weekday !== null) occurrences[weekday] += 1;
    }
    return occurrences;
};

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const toNonNegativeInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

export const buildCompletePosActivityWeekdayHourProfile = ({ slotAggregates = [], dateFrom, dateTo } = {}) => {
    const occurrences = countPosActivityWeekdayOccurrences(dateFrom, dateTo);
    const bySlot = new Map();
    for (const row of Array.isArray(slotAggregates) ? slotAggregates : []) {
        const weekday = Number(row?.weekday);
        const hour = Number(row?.hour);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
        bySlot.set(`${weekday}:${hour}`, row);
    }
    const profile = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
            const aggregate = bySlot.get(`${weekday}:${hour}`) || {};
            const saleCount = toNonNegativeInt(aggregate.sale_count);
            const slotOccurrences = occurrences[weekday] || 0;
            profile.push({
                weekday,
                weekday_label: POS_ACTIVITY_WEEKDAY_LABELS[weekday],
                hour,
                hour_label: formatPosActivityHourLabel(hour),
                sale_count: saleCount,
                payment_total: number(aggregate.payment_total),
                distinct_customer_count: toNonNegativeInt(aggregate.distinct_customer_count),
                occurrences: slotOccurrences,
                avg_sales_per_occurrence: slotOccurrences > 0 ? saleCount / slotOccurrences : 0
            });
        }
    }
    return profile;
};

export const rankPosActivityQuietPeriods = (profile = [], limit = POS_ACTIVITY_QUIET_PERIOD_LIMIT) => {
    const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 168) : POS_ACTIVITY_QUIET_PERIOD_LIMIT;
    return [...(Array.isArray(profile) ? profile : [])]
        .sort((a, b) => {
            if (a.avg_sales_per_occurrence !== b.avg_sales_per_occurrence) {
                return a.avg_sales_per_occurrence - b.avg_sales_per_occurrence;
            }
            if (a.payment_total !== b.payment_total) return a.payment_total - b.payment_total;
            if (a.weekday !== b.weekday) return a.weekday - b.weekday;
            return a.hour - b.hour;
        })
        .slice(0, normalizedLimit)
        .map((slot, index) => ({ rank: index + 1, ...slot }));
};

export const buildPosActivityDailySeries = ({ dailyAggregates = [], dateFrom, dateTo } = {}) => {
    const byDate = new Map(
        (Array.isArray(dailyAggregates) ? dailyAggregates : []).map((row) => [
            String(row?.business_date || ''),
            { sale_count: toNonNegativeInt(row?.sale_count), payment_total: number(row?.payment_total) }
        ])
    );
    return listPosActivityDateKeys(dateFrom, dateTo).map((businessDate) => {
        const aggregate = byDate.get(businessDate) || { sale_count: 0, payment_total: 0 };
        const weekday = posActivityWeekdayIndexOfDateKey(businessDate);
        return {
            business_date: businessDate,
            weekday: weekday ?? 0,
            weekday_label: weekday !== null ? POS_ACTIVITY_WEEKDAY_LABELS[weekday] : '',
            sale_count: aggregate.sale_count,
            payment_total: aggregate.payment_total
        };
    });
};
