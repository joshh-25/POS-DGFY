const MANILA_TIME_ZONE = 'Asia/Manila';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const formatDateOnly = (date, timeZone) => new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(date);

export const DATE_RANGE_PRESETS = Object.freeze([
    { value: 'today', label: 'Today' },
    { value: 'last_7_days', label: 'Last 7 days' },
    { value: 'last_30_days', label: 'Last 30 days' },
    { value: 'custom', label: 'Custom' }
]);

export const isHistoricalBusinessAdminSection = (section) => (
    ['orders', 'shifts', 'expenses', 'audit'].includes(section)
);

export const getManilaToday = () => formatDateOnly(new Date(), MANILA_TIME_ZONE);

export const shiftDateOnly = (dateValue, days) => {
    const normalized = String(dateValue || '').trim();
    if (!DATE_ONLY_PATTERN.test(normalized)) return normalized;
    const [year, month, day] = normalized.split('-').map(Number);
    return formatDateOnly(new Date(Date.UTC(year, month - 1, day + Number(days || 0))), 'UTC');
};

export const getDateRangeForPreset = (preset, today = getManilaToday()) => {
    const normalizedPreset = DATE_RANGE_PRESETS.some((option) => option.value === preset) ? preset : 'today';
    if (normalizedPreset === 'last_7_days') return { dateFrom: shiftDateOnly(today, -6), dateTo: today };
    if (normalizedPreset === 'last_30_days') return { dateFrom: shiftDateOnly(today, -29), dateTo: today };
    return { dateFrom: today, dateTo: today };
};

export const getDefaultDateRangePreset = (section) => (
    isHistoricalBusinessAdminSection(section) ? 'last_30_days' : 'today'
);

export const getDefaultDateRangeForSection = (section, today = getManilaToday()) => (
    getDateRangeForPreset(getDefaultDateRangePreset(section), today)
);

export const formatDateRangeLabel = (dateFrom, dateTo) => {
    if (dateFrom && dateTo && dateFrom !== dateTo) return `${dateFrom} – ${dateTo}`;
    return dateFrom || dateTo || 'selected range';
};
