import { normalizeStorefrontBusinessHours } from '../../../../shared/model/storefrontHoursModel.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_KEY_ALIASES = {
  0: ['0', 'sun', 'sunday'],
  1: ['1', 'mon', 'monday'],
  2: ['2', 'tue', 'tues', 'tuesday'],
  3: ['3', 'wed', 'wednesday'],
  4: ['4', 'thu', 'thur', 'thurs', 'thursday'],
  5: ['5', 'fri', 'friday'],
  6: ['6', 'sat', 'saturday']
};
const STORE_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_MAX_LOOKAHEAD_DAYS = 30;

const pad2 = (value) => String(value).padStart(2, '0');

const parseJsonLoose = (value) => {
  if (value == null || typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch {
    return null;
  }
};

const parseCalendarDate = (dateString) => {
  const match = String(dateString || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, date, dayIndex: date.getUTCDay() };
};

const formatCalendarDate = (date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;

const formatCalendarDateForLocale = (dateString, options) => {
  const parsed = parseCalendarDate(dateString);
  if (!parsed) return '';
  return parsed.date.toLocaleDateString('en-PH', { ...options, timeZone: 'UTC' });
};

const toValidDate = (value) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const getTimeZoneClock = (value, timeZone = 'Asia/Manila') => {
  const date = toValidDate(value);
  const getParts = (zone) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).reduce((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value;
      return result;
    }, {});
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const second = Number(parts.second);
    const parsedDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
    const dayIndex = parsedDate.getUTCDay();
    return {
      dateString: `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`,
      dayIndex,
      minutes: (hour * 60) + minute + (second / 60),
      hour,
      minute,
      second,
      timeZone: zone
    };
  };

  try {
    return getParts(timeZone);
  } catch {
    return getParts(undefined);
  }
};

const getScheduleOptions = (options = {}) => {
  const resolved = options && typeof options === 'object' ? options : {};
  return {
    storefrontHours: resolved.storefrontHours,
    now: toValidDate(resolved.now),
    maxLookaheadDays: Math.max(1, Number(resolved.maxLookaheadDays || DEFAULT_MAX_LOOKAHEAD_DAYS))
  };
};

export const formatServiceAppointmentSummary = (appointmentAt) => {
  const raw = String(appointmentAt || '').trim();
  if (!raw || !raw.includes('T')) return 'Schedule needed';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return 'Schedule needed';
  return parsed.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

export const formatLongDateLabel = (dateString) => {
  if (!dateString) return 'Pick a date';
  return formatCalendarDateForLocale(dateString, { month: 'long', day: 'numeric', year: 'numeric' }) || 'Pick a date';
};

export const formatShortDateLabel = (dateString) => {
  if (!dateString) return 'Pick a date';
  return formatCalendarDateForLocale(dateString, { month: 'short', day: 'numeric' }) || 'Pick a date';
};

export const formatTimeSlotLabel = (timeString) => {
  if (!timeString) return 'Pick a time';
  const [hourRaw, minuteRaw = '00'] = String(timeString).split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 'Pick a time';
  const normalized = new Date(2000, 0, 1, hour, minute, 0, 0);
  return normalized.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

export const getDatePartFromAppointment = (appointmentAt) => {
  const raw = String(appointmentAt || '').trim();
  if (raw.includes('T')) return raw.split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
};

export const getTimePartFromAppointment = (appointmentAt) => {
  const raw = String(appointmentAt || '').trim();
  if (!raw.includes('T')) return '';
  const timePart = raw.split('T')[1] || '';
  return timePart.slice(0, 5);
};

export const combineDateAndTimeParts = (datePart, timePart) => {
  if (!datePart || !timePart) return '';
  return `${datePart}T${timePart}`;
};

const normalizeSlotClockValue = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${pad2(hour)}:${pad2(minute)}`;
};

const toMinutesFromClock = (clockValue) => {
  const normalized = normalizeSlotClockValue(clockValue);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return (hour * 60) + minute;
};

const parseWeeklyAvailabilitySlot = (entry) => {
  if (typeof entry === 'string') {
    const [startRaw, endRaw] = entry.split('-');
    const start = normalizeSlotClockValue(startRaw);
    const end = normalizeSlotClockValue(endRaw);
    return start && end ? { start, end } : null;
  }
  if (entry && typeof entry === 'object') {
    const start = normalizeSlotClockValue(entry.start || entry.from || entry.open);
    const end = normalizeSlotClockValue(entry.end || entry.to || entry.close);
    return start && end ? { start, end } : null;
  }
  return null;
};

const getServiceWeeklyAvailability = (serviceItem) => parseJsonLoose(
  serviceItem?.service_resources?.weekly_availability
  || serviceItem?.service_detail?.service_resources?.weekly_availability
  || serviceItem?.service_detail?.weekly_availability
  || null
);

const getServiceDurationMinutes = (serviceItem) => {
  const duration = Number(serviceItem?.service_detail?.duration_minutes || serviceItem?.duration_minutes || 0);
  return Number.isFinite(duration) && duration > 0 ? duration : 120;
};

const getServiceLeadTimeMinutes = (serviceItem) => {
  const leadTime = Number(serviceItem?.service_detail?.lead_time_minutes || serviceItem?.lead_time_minutes || 0);
  return Number.isFinite(leadTime) && leadTime > 0 ? leadTime : 0;
};

const getNormalizedWeeklyAvailabilityByDay = (serviceItem) => {
  const raw = getServiceWeeklyAvailability(serviceItem);
  const source = raw?.weekly && typeof raw.weekly === 'object' ? raw.weekly : raw;
  const resolved = {};
  for (let dayIndex = 0; dayIndex <= 6; dayIndex += 1) {
    let dayValue = null;
    const aliases = DAY_KEY_ALIASES[dayIndex] || [];
    for (const alias of aliases) {
      if (source && Object.prototype.hasOwnProperty.call(source, alias)) {
        dayValue = source[alias];
        break;
      }
    }
    const normalizedEntries = (Array.isArray(dayValue) ? dayValue : dayValue != null ? [dayValue] : [])
      .map(parseWeeklyAvailabilitySlot)
      .filter(Boolean);
    resolved[dayIndex] = normalizedEntries;
  }
  return resolved;
};

const getNormalizedStorefrontWeeklyHours = (storefrontHours) => {
  const normalized = normalizeStorefrontBusinessHours(storefrontHours);
  return {
    timezone: normalized.timezone || 'Asia/Manila',
    weekly: STORE_DAY_KEYS.reduce((result, dayKey, dayIndex) => {
      const day = normalized.weekly?.[dayKey];
      result[dayIndex] = day?.enabled === true
        ? (day.intervals || []).map((interval) => ({
          start: normalizeSlotClockValue(interval?.open),
          end: normalizeSlotClockValue(interval?.close)
        })).filter((interval) => interval.start && interval.end)
        : [];
      return result;
    }, {})
  };
};

const getIntervalRangesForDay = (dayMap, dayIndex) => {
  const currentEntries = dayMap[dayIndex] || [];
  const previousEntries = dayMap[(dayIndex + 6) % 7] || [];
  const ranges = [];
  const appendEntry = (entry, part) => {
    const start = toMinutesFromClock(entry.start);
    const end = toMinutesFromClock(entry.end);
    if (start == null || end == null) return;
    if (start === end) {
      ranges.push([0, 1440]);
      return;
    }
    if (end > start) {
      if (part === 'current') ranges.push([start, end]);
      return;
    }
    if (part === 'current') ranges.push([start, 1440]);
    if (part === 'previous') ranges.push([0, end]);
  };
  currentEntries.forEach((entry) => appendEntry(entry, 'current'));
  previousEntries.forEach((entry) => appendEntry(entry, 'previous'));
  return ranges
    .filter(([start, end]) => end > start)
    .sort((first, second) => first[0] - second[0]);
};

const intersectScheduleRanges = (serviceRanges, storeRanges) => {
  if (serviceRanges == null) return storeRanges;
  if (storeRanges == null) return serviceRanges;
  return serviceRanges.flatMap(([serviceStart, serviceEnd]) => storeRanges
    .map(([storeStart, storeEnd]) => [Math.max(serviceStart, storeStart), Math.min(serviceEnd, storeEnd)])
    .filter(([start, end]) => end > start));
};

const getAvailableScheduleRanges = (serviceItem, dateString, storefrontHours) => {
  const parsedDate = parseCalendarDate(dateString);
  if (!parsedDate) return [];
  const serviceDayMap = getNormalizedWeeklyAvailabilityByDay(serviceItem);
  const hasServiceRules = Object.values(serviceDayMap).some((entries) => entries.length > 0);
  const serviceRanges = hasServiceRules ? getIntervalRangesForDay(serviceDayMap, parsedDate.dayIndex) : null;
  const storefrontSchedule = getNormalizedStorefrontWeeklyHours(storefrontHours);
  const storeRanges = getIntervalRangesForDay(storefrontSchedule.weekly, parsedDate.dayIndex);
  return intersectScheduleRanges(serviceRanges, storeRanges);
};

const getDateAfterOffset = (dateString, offset) => {
  const parsed = parseCalendarDate(dateString);
  if (!parsed) return '';
  const next = new Date(parsed.date.getTime());
  next.setUTCDate(next.getUTCDate() + offset);
  return formatCalendarDate(next);
};

const getTimeSlotStepMinutes = (serviceItem) => Math.max(60, Math.min(120, getServiceDurationMinutes(serviceItem)));

const buildTimeSlotOptionsForDate = (serviceItem, dateString, options = {}) => {
  const parsedDate = parseCalendarDate(dateString);
  if (!parsedDate) return [];
  const { storefrontHours, now } = getScheduleOptions(options);
  const storefrontSchedule = getNormalizedStorefrontWeeklyHours(storefrontHours);
  const nowClock = getTimeZoneClock(now, storefrontSchedule.timezone);
  if (dateString < nowClock.dateString) return [];
  const minimumStartMinutes = dateString === nowClock.dateString
    ? nowClock.minutes + getServiceLeadTimeMinutes(serviceItem)
    : Number.NEGATIVE_INFINITY;
  const durationMinutes = getServiceDurationMinutes(serviceItem);
  const intervalMinutes = getTimeSlotStepMinutes(serviceItem);
  const ranges = getAvailableScheduleRanges(serviceItem, dateString, storefrontHours);
  const values = [];

  ranges.forEach(([startMinutes, endMinutes]) => {
    for (let minute = startMinutes; minute + durationMinutes <= endMinutes; minute += intervalMinutes) {
      if (minute <= minimumStartMinutes) continue;
      const clockValue = `${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`;
      values.push(clockValue);
    }
  });

  return [...new Set(values)].sort().map((value, index) => ({
    value,
    label: formatTimeSlotLabel(value),
    source: 'availability',
    recommended: index === 0
  }));
};

export const buildServiceDateOptions = (serviceItem, maxOptions = 7, options = {}) => {
  const resolvedMaxOptions = typeof maxOptions === 'object' ? 7 : maxOptions;
  const resolvedOptions = typeof maxOptions === 'object' ? maxOptions : options;
  const { storefrontHours, now, maxLookaheadDays } = getScheduleOptions(resolvedOptions);
  const storefrontSchedule = getNormalizedStorefrontWeeklyHours(storefrontHours);
  const nowClock = getTimeZoneClock(now, storefrontSchedule.timezone);
  const dateOptions = [];

  for (let offset = 0; offset < maxLookaheadDays && dateOptions.length < Math.max(1, Number(resolvedMaxOptions || 7)); offset += 1) {
    const dateString = getDateAfterOffset(nowClock.dateString, offset);
    const timeSlots = buildTimeSlotOptionsForDate(serviceItem, dateString, { storefrontHours, now });
    if (timeSlots.length === 0) continue;
    const parsedDate = parseCalendarDate(dateString);
    dateOptions.push({
      value: dateString,
      label: formatShortDateLabel(dateString),
      weekday: DAY_LABELS[parsedDate.dayIndex],
      offset,
      hasAvailability: true,
      recommended: dateOptions.length === 0,
      recommendedTime: timeSlots[0]?.value || ''
    });
  }
  return dateOptions;
};

export const buildServiceCalendarDateOptions = (serviceItem, options = {}) => {
  const { storefrontHours, now, maxLookaheadDays } = getScheduleOptions(options);
  const storefrontSchedule = getNormalizedStorefrontWeeklyHours(storefrontHours);
  const nowClock = getTimeZoneClock(now, storefrontSchedule.timezone);
  const calendarDateOptions = [];

  for (let offset = 0; offset < maxLookaheadDays; offset += 1) {
    const dateString = getDateAfterOffset(nowClock.dateString, offset);
    const timeSlots = buildTimeSlotOptionsForDate(serviceItem, dateString, { storefrontHours, now });
    const parsedDate = parseCalendarDate(dateString);
    if (!parsedDate) continue;
    calendarDateOptions.push({
      value: dateString,
      label: formatShortDateLabel(dateString),
      weekday: DAY_LABELS[parsedDate.dayIndex],
      offset,
      hasAvailability: timeSlots.length > 0,
      recommended: false,
      recommendedTime: timeSlots[0]?.value || ''
    });
  }

  const recommendedIndex = calendarDateOptions.findIndex((option) => option.hasAvailability);
  if (recommendedIndex < 0) return calendarDateOptions;
  return calendarDateOptions.map((option, index) => ({
    ...option,
    recommended: index === recommendedIndex
  }));
};

export const buildServiceTimeSlotOptions = (serviceItem, dateString, options = {}) => {
  if (!dateString) return [];
  return buildTimeSlotOptionsForDate(serviceItem, dateString, options);
};

export const getPreferredBookingTimeForDate = (serviceItem, dateString, currentTime = '', options = {}) => {
  const availableSlots = buildServiceTimeSlotOptions(serviceItem, dateString, options);
  if (currentTime && availableSlots.some((slot) => slot.value === currentTime)) return currentTime;
  return availableSlots[0]?.value || '';
};

export const getServiceScheduleRecommendation = (serviceItem, options = {}) => {
  const dateOptions = buildServiceDateOptions(serviceItem, 7, options);
  const date = dateOptions[0] || null;
  if (!date || !date.recommendedTime) return null;
  return {
    date: date.value,
    dateLabel: date.label,
    time: date.recommendedTime,
    timeLabel: formatTimeSlotLabel(date.recommendedTime)
  };
};
