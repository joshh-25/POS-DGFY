export const STOREFRONT_BUSINESS_DAY_OPTIONS = Object.freeze([
  { key: 'sun', label: 'Sun' },
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' }
]);

const DEFAULT_TIMEZONE = 'Asia/Manila';
export const STOREFRONT_BUSINESS_HOURS_DISPLAY_MAX_LENGTH = 120;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalizeTime = (value, fallback) => {
  const text = String(value || '').trim();
  return TIME_PATTERN.test(text) ? text : fallback;
};

const defaultDay = (enabled = true) => ({
  enabled,
  open: '09:00',
  close: '18:00',
  intervals: [{ open: '09:00', close: '18:00' }]
});

export const createDefaultStorefrontBusinessHours = () => ({
  mode: 'weekly',
  timezone: DEFAULT_TIMEZONE,
  weekly: {
    sun: defaultDay(false),
    mon: defaultDay(true),
    tue: defaultDay(true),
    wed: defaultDay(true),
    thu: defaultDay(true),
    fri: defaultDay(true),
    sat: defaultDay(true)
  },
  display: 'Mon-Sat 9:00 AM - 6:00 PM'
});

const parseJsonLoose = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch {
    return null;
  }
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

const normalizeDay = (entry, fallbackEnabled) => {
  const intervals = normalizeIntervals(entry);
  const first = intervals[0] || { open: '09:00', close: '18:00' };
  return {
    enabled: entry?.enabled == null ? fallbackEnabled : entry.enabled === true,
    open: first.open,
    close: first.close,
    intervals
  };
};

const to24Hour = (hour, minute, meridiem) => {
  const parsedHour = Number.parseInt(hour, 10);
  const parsedMinute = Number.parseInt(minute, 10);
  const marker = String(meridiem || '').trim().toUpperCase();
  if (!Number.isInteger(parsedHour) || parsedHour < 1 || parsedHour > 12) return null;
  if (!Number.isInteger(parsedMinute) || parsedMinute < 0 || parsedMinute > 59) return null;
  if (marker !== 'AM' && marker !== 'PM') return null;
  let hour24 = parsedHour % 12;
  if (marker === 'PM') hour24 += 12;
  return `${String(hour24).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`;
};

const parseLegacyHours = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*(.*)$/i);
  if (!match) return null;
  const open = to24Hour(match[1], match[2], match[3]);
  const close = to24Hour(match[4], match[5], match[6]);
  if (!open || !close) return null;

  const dayPart = String(match[7] || '').trim().toLowerCase();
  const enabledKeys = new Set(STOREFRONT_BUSINESS_DAY_OPTIONS.map((day) => day.key));
  if (dayPart && !['daily', 'everyday', 'all days'].includes(dayPart)) {
    enabledKeys.clear();
    dayPart.split(',').map((entry) => entry.trim().slice(0, 3)).forEach((token) => {
      if (token === 'thu') enabledKeys.add('thu');
      const day = STOREFRONT_BUSINESS_DAY_OPTIONS.find((option) => option.key === token);
      if (day) enabledKeys.add(day.key);
    });
    if (enabledKeys.size === 0) return null;
  }

  const schedule = createDefaultStorefrontBusinessHours();
  STOREFRONT_BUSINESS_DAY_OPTIONS.forEach((day) => {
    schedule.weekly[day.key] = {
      enabled: enabledKeys.has(day.key),
      open,
      close,
      intervals: [{ open, close }]
    };
  });
  schedule.display = formatStorefrontBusinessHoursDisplay(schedule);
  return schedule;
};

export const normalizeStorefrontBusinessHours = (value) => {
  const fallback = createDefaultStorefrontBusinessHours();
  const parsed = parseJsonLoose(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return parseLegacyHours(value) || fallback;
  }

  return {
    mode: 'weekly',
    timezone: String(parsed.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE,
    weekly: STOREFRONT_BUSINESS_DAY_OPTIONS.reduce((acc, day) => {
      acc[day.key] = normalizeDay(parsed.weekly?.[day.key], fallback.weekly[day.key].enabled);
      return acc;
    }, {}),
    display: String(parsed.display || '').trim()
  };
};

export const setStorefrontBusinessHoursOpenAllDay = (hours, enabled = true) => {
  const current = normalizeStorefrontBusinessHours(hours);
  return {
    ...current,
    weekly: STOREFRONT_BUSINESS_DAY_OPTIONS.reduce((acc, day) => {
      acc[day.key] = {
        enabled: enabled === true,
        open: '00:00',
        close: '00:00',
        intervals: [{ open: '00:00', close: '00:00' }]
      };
      return acc;
    }, {})
  };
};

export const applyStorefrontBusinessHoursRange = (hours, {
  open = '09:00',
  close = '17:00',
  dayKeys = []
} = {}) => {
  const current = normalizeStorefrontBusinessHours(hours);
  const selectedDays = new Set((Array.isArray(dayKeys) ? dayKeys : [])
    .map((dayKey) => String(dayKey || '').trim().toLowerCase())
    .filter((dayKey) => STOREFRONT_BUSINESS_DAY_OPTIONS.some((day) => day.key === dayKey)));
  const nextOpen = TIME_PATTERN.test(String(open || '').trim()) ? String(open).trim() : '09:00';
  const nextClose = TIME_PATTERN.test(String(close || '').trim()) ? String(close).trim() : '17:00';
  const nextIntervals = [{ open: nextOpen, close: nextClose }];

  return {
    ...current,
    weekly: STOREFRONT_BUSINESS_DAY_OPTIONS.reduce((acc, day) => {
      acc[day.key] = selectedDays.has(day.key)
        ? { enabled: true, open: nextOpen, close: nextClose, intervals: nextIntervals }
        : { ...current.weekly[day.key] };
      return acc;
    }, {})
  };
};

export const addStorefrontBusinessHoursInterval = (hours, dayKey) => {
  const current = normalizeStorefrontBusinessHours(hours);
  const day = current.weekly[dayKey];
  if (!day) return current;
  const intervals = [...day.intervals, { open: '13:00', close: '20:00' }];
  return {
    ...current,
    weekly: {
      ...current.weekly,
      [dayKey]: {
        ...day,
        enabled: true,
        intervals,
        open: intervals[0].open,
        close: intervals[0].close
      }
    }
  };
};

export const updateStorefrontBusinessHoursInterval = (hours, dayKey, index, patch = {}) => {
  const current = normalizeStorefrontBusinessHours(hours);
  const day = current.weekly[dayKey];
  if (!day || !day.intervals[index]) return current;
  const intervals = day.intervals.map((interval, currentIndex) => {
    if (currentIndex !== index) return interval;
    return {
      open: normalizeTime(patch.open ?? interval.open, interval.open),
      close: normalizeTime(patch.close ?? interval.close, interval.close)
    };
  });
  return {
    ...current,
    weekly: {
      ...current.weekly,
      [dayKey]: {
        ...day,
        intervals,
        open: intervals[0].open,
        close: intervals[0].close
      }
    }
  };
};

export const removeStorefrontBusinessHoursInterval = (hours, dayKey, index) => {
  const current = normalizeStorefrontBusinessHours(hours);
  const day = current.weekly[dayKey];
  if (!day || day.intervals.length <= 1) return current;
  const intervals = day.intervals.filter((_, currentIndex) => currentIndex !== index);
  return {
    ...current,
    weekly: {
      ...current.weekly,
      [dayKey]: {
        ...day,
        intervals,
        open: intervals[0].open,
        close: intervals[0].close
      }
    }
  };
};

export const moveStorefrontBusinessHoursInterval = (hours, dayKey, index, direction) => {
  const current = normalizeStorefrontBusinessHours(hours);
  const day = current.weekly[dayKey];
  if (!day) return current;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= day.intervals.length) return current;
  const intervals = [...day.intervals];
  [intervals[index], intervals[targetIndex]] = [intervals[targetIndex], intervals[index]];
  return {
    ...current,
    weekly: {
      ...current.weekly,
      [dayKey]: {
        ...day,
        intervals,
        open: intervals[0].open,
        close: intervals[0].close
      }
    }
  };
};

export const isStorefrontBusinessHoursAlwaysOpen = (hours) => {
  const current = normalizeStorefrontBusinessHours(hours);
  return STOREFRONT_BUSINESS_DAY_OPTIONS.every((day) => {
    const entry = current.weekly[day.key];
    return entry?.enabled === true
      && entry.intervals.length === 1
      && entry.intervals[0].open === '00:00'
      && entry.intervals[0].close === '00:00';
  });
};

const formatMinutes = (time) => {
  const [hourRaw, minuteRaw] = String(time || '00:00').split(':');
  const hour24 = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return '';
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
};

const intervalSignature = (entry) => (entry?.intervals || [])
  .map((interval) => `${interval.open}-${interval.close}`)
  .join('|');

const formatInterval = (interval) => (
  interval.open === interval.close
    ? '24 hours'
    : `${formatMinutes(interval.open)} - ${formatMinutes(interval.close)}`
);

const timeToMinutes = (value) => {
  const [hourRaw, minuteRaw] = String(value || '').split(':');
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return (hour * 60) + minute;
};

const intervalRangesForOverlap = (interval) => {
  const open = timeToMinutes(interval.open);
  const close = timeToMinutes(interval.close);
  if (open == null || close == null || open === close) return [];
  if (close > open) return [[open, close]];
  return [[open, 1440], [0, close]];
};

export const getStorefrontBusinessHoursDayIssues = (dayHours = {}) => {
  if (!dayHours.enabled) return [];
  const ranges = (dayHours.intervals || []).flatMap(intervalRangesForOverlap)
    .sort((first, second) => first[0] - second[0]);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index][0] < ranges[index - 1][1]) {
      return ['Time intervals cannot overlap.'];
    }
  }
  return [];
};

export const formatStorefrontBusinessHoursDisplay = (hours) => {
  const schedule = normalizeStorefrontBusinessHours(hours);
  const segments = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const label = current.start === current.end ? current.startLabel : `${current.startLabel}-${current.endLabel}`;
    const hoursLabel = current.intervals.map(formatInterval).join(', ');
    segments.push(`${label} ${hoursLabel}`);
  };

  STOREFRONT_BUSINESS_DAY_OPTIONS.forEach((day) => {
    const entry = schedule.weekly[day.key];
    if (!entry?.enabled) {
      flush();
      current = null;
      return;
    }
    const signature = intervalSignature(entry);
    if (current?.signature === signature) {
      current.end = day.key;
      current.endLabel = day.label;
      return;
    }
    flush();
    current = {
      start: day.key,
      end: day.key,
      startLabel: day.label,
      endLabel: day.label,
      intervals: entry.intervals,
      signature
    };
  });
  flush();

  return segments.length > 0 ? segments.join('; ') : 'Closed';
};

export const serializeStorefrontBusinessHours = (hours) => {
  const normalized = normalizeStorefrontBusinessHours(hours);
  return {
    ...normalized,
    display: formatStorefrontBusinessHoursDisplay(normalized).slice(0, STOREFRONT_BUSINESS_HOURS_DISPLAY_MAX_LENGTH)
  };
};
