const DAY_ORDER = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
const DAY_LABELS = Object.freeze({
    sun: 'Sun',
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat'
});
const WEEKDAY_INDEX_BY_TOKEN = Object.freeze({
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6
});

const DEFAULT_TIMEZONE = 'Asia/Manila';
const TIME_24H_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseJsonLoosely = (raw) => {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') {
            try {
                return JSON.parse(parsed);
            } catch {
                return parsed;
            }
        }
        return parsed;
    } catch {
        return null;
    }
};

const toMinutesFrom24Hour = (value) => {
    const match = String(value || '').trim().match(TIME_24H_PATTERN);
    if (!match) return null;
    return (Number.parseInt(match[1], 10) * 60) + Number.parseInt(match[2], 10);
};

const normalizeTime = (value, fallback) => {
    const text = String(value || '').trim();
    return TIME_24H_PATTERN.test(text) ? text : fallback;
};

const formatMinutes = (minutes) => {
    const safeMinutes = Number(minutes);
    if (!Number.isFinite(safeMinutes)) return '';
    const hour24 = Math.floor(safeMinutes / 60) % 24;
    const minute = safeMinutes % 60;
    const meridiem = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
};

const normalizeIntervals = (entry) => {
    const source = Array.isArray(entry?.intervals) && entry.intervals.length > 0
        ? entry.intervals
        : [{ open: entry?.open, close: entry?.close }];
    const intervals = source
        .map((interval) => ({
            open: normalizeTime(interval?.open, ''),
            close: normalizeTime(interval?.close, '')
        }))
        .filter((interval) => interval.open && interval.close);
    return intervals.length > 0 ? intervals : [{ open: '09:00', close: '18:00' }];
};

const normalizeDaySchedule = (entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return { enabled: false, open: '09:00', close: '18:00', intervals: [{ open: '09:00', close: '18:00' }] };
    }
    const intervals = normalizeIntervals(entry);
    const first = intervals[0] || { open: '09:00', close: '18:00' };
    return {
        enabled: entry.enabled === true,
        open: first.open,
        close: first.close,
        intervals
    };
};

const summarizeWeeklySchedule = (weekly) => {
    const segments = [];
    let current = null;
    const pushCurrent = () => {
        if (!current) return;
        const label = current.start === current.end
            ? DAY_LABELS[current.start]
            : `${DAY_LABELS[current.start]}-${DAY_LABELS[current.end]}`;
        const hoursLabel = current.intervals
            .map((interval) => {
                const openMinutes = toMinutesFrom24Hour(interval.open);
                const closeMinutes = toMinutesFrom24Hour(interval.close);
                if (openMinutes == null || closeMinutes == null) return '';
                return openMinutes === closeMinutes
                    ? '24 hours'
                    : `${formatMinutes(openMinutes)} - ${formatMinutes(closeMinutes)}`;
            })
            .filter(Boolean)
            .join(', ');
        segments.push(`${label} ${hoursLabel}`);
    };

    DAY_ORDER.forEach((dayKey) => {
        const entry = weekly[dayKey];
        if (!entry?.enabled) {
            pushCurrent();
            current = null;
            return;
        }
        const signature = (entry.intervals || [])
            .map((interval) => `${toMinutesFrom24Hour(interval.open)}-${toMinutesFrom24Hour(interval.close)}`)
            .join('|');
        if (current?.signature === signature) {
            current.end = dayKey;
            return;
        }
        pushCurrent();
        current = { start: dayKey, end: dayKey, intervals: entry.intervals || [], signature };
    });
    pushCurrent();

    return segments.length > 0 ? segments.join('; ') : 'Closed';
};

export const normalizeStorefrontBusinessHours = (rawValue) => {
    const parsed = parseJsonLoosely(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return typeof rawValue === 'string' ? rawValue.trim().slice(0, 120) : '';
    }

    const weekly = {};
    DAY_ORDER.forEach((dayKey) => {
        weekly[dayKey] = normalizeDaySchedule(parsed.weekly?.[dayKey]);
    });

    const timezone = String(parsed.timezone || DEFAULT_TIMEZONE).trim().slice(0, 80) || DEFAULT_TIMEZONE;
    return {
        mode: 'weekly',
        timezone,
        weekly,
        display: String(parsed.display || summarizeWeeklySchedule(weekly)).trim().slice(0, 120) || summarizeWeeklySchedule(weekly)
    };
};

const toMinutesFrom12Hour = (hour, minute, meridiem) => {
    const safeHour = Number.parseInt(hour, 10);
    const safeMinute = Number.parseInt(minute, 10);
    const normalizedMeridiem = String(meridiem || '').trim().toUpperCase();
    if (!Number.isInteger(safeHour) || safeHour < 1 || safeHour > 12) return null;
    if (!Number.isInteger(safeMinute) || safeMinute < 0 || safeMinute > 59) return null;
    if (normalizedMeridiem !== 'AM' && normalizedMeridiem !== 'PM') return null;
    let hour24 = safeHour % 12;
    if (normalizedMeridiem === 'PM') hour24 += 12;
    return (hour24 * 60) + safeMinute;
};

const parseLegacyHoursWindow = (rawHours) => {
    const text = String(rawHours || '').trim();
    if (!text) return null;

    const match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*(.*)$/i);
    if (!match) return null;

    const startMinutes = toMinutesFrom12Hour(match[1], match[2], match[3]);
    const endMinutes = toMinutesFrom12Hour(match[4], match[5], match[6]);
    if (startMinutes == null || endMinutes == null) return null;

    const dayPart = String(match[7] || '').trim().toLowerCase();
    let activeDays = new Set([0, 1, 2, 3, 4, 5, 6]);

    if (dayPart && dayPart !== 'daily' && dayPart !== 'everyday' && dayPart !== 'all days') {
        const tokens = dayPart
            .split(',')
            .map((entry) => entry.trim().replace(/\./g, '').toLowerCase())
            .filter(Boolean);
        if (tokens.length === 0) return null;
        activeDays = new Set();
        for (const token of tokens) {
            const dayIndex = WEEKDAY_INDEX_BY_TOKEN[token];
            if (dayIndex == null) return null;
            activeDays.add(dayIndex);
        }
        if (activeDays.size === 0) return null;
    }

    return { activeDays, startMinutes, endMinutes };
};

const getZonedParts = (date, timezone) => {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone || DEFAULT_TIMEZONE,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
        const dayIndex = WEEKDAY_INDEX_BY_TOKEN[String(parts.weekday || '').toLowerCase()];
        return {
            dayIndex: dayIndex == null ? date.getDay() : dayIndex,
            minutes: (Number.parseInt(parts.hour, 10) * 60) + Number.parseInt(parts.minute, 10)
        };
    } catch {
        return {
            dayIndex: date.getDay(),
            minutes: (date.getHours() * 60) + date.getMinutes()
        };
    }
};

const getZonedUtcOffsetMinutes = (utcInstant, timezone) => {
    try {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
            timeZone: timezone || DEFAULT_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).formatToParts(utcInstant).map((part) => [part.type, part.value]));
        const wallClockAsUtcMs = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour) % 24,
            Number(parts.minute),
            Number(parts.second)
        );
        return Math.round((wallClockAsUtcMs - utcInstant.getTime()) / 60000);
    } catch {
        return 0;
    }
};

// Returns the UTC instant for local midnight, in `timezone`, of the calendar
// day `date` falls on when viewed in that timezone -- NOT the Node process's
// local timezone (which is whatever the deployment host happens to run in).
// Used by service-booking availability generation so "today" and slot times
// reflect the tenant's configured business-hours timezone.
export const getZonedDayStart = (date, timezone) => {
    const zone = timezone || DEFAULT_TIMEZONE;
    try {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
            timeZone: zone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date).map((part) => [part.type, part.value]));
        const guessUtcMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
        const offsetMinutes = getZonedUtcOffsetMinutes(new Date(guessUtcMs), zone);
        return new Date(guessUtcMs - (offsetMinutes * 60000));
    } catch {
        const fallback = new Date(date);
        fallback.setHours(0, 0, 0, 0);
        return fallback;
    }
};

const isWithinWindow = ({ minutes, startMinutes, endMinutes }) => {
    if (startMinutes === endMinutes) return true;
    if (endMinutes > startMinutes) return minutes >= startMinutes && minutes <= endMinutes;
    return minutes >= startMinutes || minutes <= endMinutes;
};

const isDateWithinLegacyHours = (date, rawValue) => {
    const parsed = parseLegacyHoursWindow(rawValue);
    if (!parsed) return true;
    if (!parsed.activeDays.has(date.getDay())) return false;
    const minutes = (date.getHours() * 60) + date.getMinutes();
    return isWithinWindow({ minutes, startMinutes: parsed.startMinutes, endMinutes: parsed.endMinutes });
};

const isDateWithinWeeklyHours = (date, schedule) => {
    const { dayIndex, minutes } = getZonedParts(date, schedule.timezone);
    const todayKey = DAY_ORDER[dayIndex];
    const yesterdayKey = DAY_ORDER[(dayIndex + 6) % 7];
    const today = schedule.weekly?.[todayKey];
    const yesterday = schedule.weekly?.[yesterdayKey];

    if (today?.enabled) {
        const matched = (today.intervals || []).some((interval) => {
            const startMinutes = toMinutesFrom24Hour(interval.open);
            const endMinutes = toMinutesFrom24Hour(interval.close);
            if (startMinutes == null || endMinutes == null) return false;
            return isWithinWindow({ minutes, startMinutes, endMinutes });
        });
        if (matched) return true;
    }

    if (yesterday?.enabled) {
        const matched = (yesterday.intervals || []).some((interval) => {
            const startMinutes = toMinutesFrom24Hour(interval.open);
            const endMinutes = toMinutesFrom24Hour(interval.close);
            return startMinutes != null && endMinutes != null && endMinutes < startMinutes && minutes <= endMinutes;
        });
        if (matched) return true;
    }

    return false;
};

export const isDateWithinStorefrontBusinessHours = (date, rawValue) => {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return true;
    const normalized = normalizeStorefrontBusinessHours(rawValue);
    if (!normalized) return true;
    if (typeof normalized === 'string') return isDateWithinLegacyHours(date, normalized);
    if (normalized.mode === 'weekly') return isDateWithinWeeklyHours(date, normalized);
    return true;
};

export const getStorefrontBusinessHoursStatus = (rawValue, date = new Date()) => {
    const normalized = normalizeStorefrontBusinessHours(rawValue);
    const configured = Boolean(normalized);
    const display = configured
        ? formatStorefrontBusinessHoursDisplay(normalized)
        : '';
    const isOpenNow = isDateWithinStorefrontBusinessHours(date, normalized);

    return {
        configured,
        is_open_now: isOpenNow,
        display,
        reason_code: isOpenNow ? null : 'OUTSIDE_STOREFRONT_BUSINESS_HOURS'
    };
};

export const assertDateWithinStorefrontBusinessHours = ({ date, rawValue, action = 'storefront_order' } = {}) => {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return;
    if (isDateWithinStorefrontBusinessHours(date, rawValue)) return;
    const status = getStorefrontBusinessHoursStatus(rawValue, date);
    const hoursLabel = status.display ? ` (${status.display})` : '';
    throw new Error(`Storefront is outside configured business hours${hoursLabel}`, {
        cause: {
            code: 'OUTSIDE_STOREFRONT_BUSINESS_HOURS',
            statusCode: 409,
            action,
            business_hours: status
        }
    });
};

export const formatStorefrontBusinessHoursDisplay = (rawValue) => {
    const normalized = normalizeStorefrontBusinessHours(rawValue);
    if (!normalized) return '';
    if (typeof normalized === 'string') return normalized.slice(0, 120);
    return String(normalized.display || summarizeWeeklySchedule(normalized.weekly)).trim().slice(0, 120);
};
