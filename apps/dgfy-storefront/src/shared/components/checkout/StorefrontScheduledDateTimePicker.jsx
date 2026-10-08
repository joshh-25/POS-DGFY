import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHECKOUT_CONTROL_MIN_HEIGHT, CHECKOUT_FONT_FAMILY } from './checkoutUiTokens.js';
import { formatStorefrontHoursLabel, normalizeStorefrontBusinessHours } from '../../model/storefrontHoursModel.js';
import { branchWallToInstant, getBranchWallDate, getScheduleTimezone } from '../../model/storefrontScheduleTimezone.js';
import { StorefrontTimePickerSelect } from './StorefrontTimePickerSelect.jsx';

const DAY_KEYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
const DAY_LABELS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const TIME_PRECISION_MINUTES = 1;
const MAX_SELECTABLE_DAYS = 90;
const CALENDAR_SWIPE_CAPTURE_DISTANCE = 12;
const CALENDAR_SWIPE_NAVIGATION_DISTANCE = 48;
const CALENDAR_SWIPE_AXIS_RATIO = 1.2;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const EMPTY_TIME = Object.freeze({ hour: '', minute: '', period: '' });

const pad = (value) => String(value).padStart(2, '0');
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, amount) => {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
};
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1);
const formatDateKey = (date) => (
  String(date.getFullYear()) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
);

const parseDateTimeValue = (value) => {
  const text = String(value || '').trim();
  const localMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (localMatch) {
    const date = new Date(
      Number(localMatch[1]),
      Number(localMatch[2]) - 1,
      Number(localMatch[3]),
      Number(localMatch[4]),
      Number(localMatch[5])
    );
    const normalized = localMatch[1] + '-' + localMatch[2] + '-' + localMatch[3]
      + 'T' + localMatch[4] + ':' + localMatch[5];
    if (Number.isFinite(date.getTime()) && formatDateTimeValue(date) === normalized) return date;
  }

  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const formatDateTimeValue = (date) => (
  formatDateKey(date) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
);
const parseMinutes = (value) => {
  const match = String(value || '').trim().match(TIME_PATTERN);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return (hour * 60) + minute;
};
const periodForMinutes = (minutes) => (Number(minutes) >= 12 * 60 ? 'PM' : 'AM');
const hour12ForMinutes = (minutes) => String((Math.floor(Number(minutes) / 60) % 12) || 12);

const formatTime = (date) => new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit'
}).format(date);

const formatLongDate = (date) => new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}).format(date);

const formatPickerValue = (value) => {
  const date = parseDateTimeValue(value);
  if (!date) return '';
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
  return dateLabel + ' · ' + formatTime(date);
};

const getTimeParts = (date) => ({
  hour: String((date.getHours() % 12) || 12),
  minute: pad(date.getMinutes()),
  period: date.getHours() >= 12 ? 'PM' : 'AM'
});

const valueFromParts = (date, parts) => {
  if (!date || !parts?.hour || !parts?.minute || !parts?.period) return '';
  const hour12 = Number(parts.hour);
  const hour24 = (hour12 % 12) + (parts.period === 'PM' ? 12 : 0);
  const selected = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour24,
    Number(parts.minute)
  );
  return Number.isFinite(selected.getTime()) ? formatDateTimeValue(selected) : '';
};

const intervalRangesForDate = (date, schedule) => {
  const todayKey = DAY_KEYS[date.getDay()];
  const yesterdayKey = DAY_KEYS[(date.getDay() + 6) % 7];
  const ranges = [];

  const appendIntervals = (entry, includeOvernightRemainder = false) => {
    if (!entry?.enabled) return;
    (Array.isArray(entry.intervals) ? entry.intervals : []).forEach((interval) => {
      const open = parseMinutes(interval?.open);
      const close = parseMinutes(interval?.close);
      if (open == null || close == null) return;
      if (includeOvernightRemainder) {
        if (close < open) ranges.push([0, close]);
        return;
      }
      if (open === close) {
        ranges.push([0, 24 * 60]);
      } else if (close > open) {
        ranges.push([open, close]);
      } else {
        ranges.push([open, 24 * 60]);
      }
    });
  };

  appendIntervals(schedule?.weekly?.[todayKey]);
  appendIntervals(schedule?.weekly?.[yesterdayKey], true);
  return ranges
    .sort((first, second) => first[0] - second[0])
    .filter(([start, end], index, all) => index === 0 || start !== all[index - 1][0] || end !== all[index - 1][1]);
};

export const buildStorefrontTimeSlots = ({ date, storefrontHours, now = new Date(), intervalMinutes = TIME_PRECISION_MINUTES } = {}) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) || !storefrontHours) return [];
  const schedule = normalizeStorefrontBusinessHours(storefrontHours);
  const timezone = getScheduleTimezone(schedule);
  const branchNow = getBranchWallDate(now, timezone);
  const slots = [];
  const seen = new Set();
  intervalRangesForDate(date, schedule).forEach(([start, end]) => {
    const firstSlot = Math.ceil(start / intervalMinutes) * intervalMinutes;
    for (let minutes = firstSlot; minutes < end; minutes += intervalMinutes) {
      const slotDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60);
      if (slotDate.getTime() <= branchNow.getTime()) continue;
      const value = formatDateTimeValue(slotDate);
      if (seen.has(value)) continue;
      seen.add(value);
      slots.push({ date, label: formatTime(slotDate), minutes, period: periodForMinutes(minutes), value });
    }
  });
  return slots.sort((first, second) => first.minutes - second.minutes);
};

const hasAvailableSlot = ({ date, schedule, now }) => intervalRangesForDate(date, schedule)
  .some(([start, end]) => {
    const branchNow = getBranchWallDate(now, getScheduleTimezone(schedule));
    const nowMinutes = (branchNow.getHours() * 60) + branchNow.getMinutes();
    const firstFuture = isSameDay(date, branchNow) ? Math.max(start, nowMinutes) : start;
    return firstFuture < end;
  });

const resolveInitialAvailableValue = ({ value, storefrontHours, now, minimumDate, maximumDate, intervalMinutes = TIME_PRECISION_MINUTES }) => {
  const existing = parseDateTimeValue(value);
  if (existing) {
    const existingValue = formatDateTimeValue(existing);
    const matchingSlot = buildStorefrontTimeSlots({
      date: startOfDay(existing),
      storefrontHours,
      now,
      intervalMinutes
    }).find((slot) => slot.value === existingValue);
    if (matchingSlot && (!minimumDate || startOfDay(existing) >= minimumDate) && (!maximumDate || startOfDay(existing) <= maximumDate)) return matchingSlot.value;
  }

  const branchNow = getBranchWallDate(now, getScheduleTimezone(storefrontHours));
  const preferredDay = existing && existing.getTime() > branchNow.getTime()
    ? startOfDay(existing)
    : startOfDay(branchNow);
  const firstDay = minimumDate && preferredDay < minimumDate ? minimumDate : preferredDay;
  for (let offset = 0; offset <= MAX_SELECTABLE_DAYS; offset += 1) {
    const date = addDays(firstDay, offset);
    if (minimumDate && date < minimumDate) continue;
    if (maximumDate && date > maximumDate) break;
    const firstSlot = buildStorefrontTimeSlots({ date, storefrontHours, now, intervalMinutes })[0];
    if (firstSlot) return firstSlot.value;
  }
  return '';
};

const buildInitialPickerDraft = ({ value, schedule, leadTimeMinDays, leadTimeMaxDays, isDineIn, now = new Date() }) => {
  const branchNow = getBranchWallDate(now, getScheduleTimezone(schedule));
  const minimumDate = addDays(branchNow, leadTimeMinDays ?? 0);
  const maximumDate = leadTimeMaxDays != null ? addDays(branchNow, Math.min(leadTimeMaxDays, isDineIn ? MAX_SELECTABLE_DAYS : leadTimeMaxDays))
    : isDineIn ? addDays(branchNow, MAX_SELECTABLE_DAYS) : null;
  const selectedValue = resolveInitialAvailableValue({
    value,
    storefrontHours: schedule,
    now,
    minimumDate,
    maximumDate,
    intervalMinutes: TIME_PRECISION_MINUTES
  });
  const selected = parseDateTimeValue(selectedValue);
  const focusDate = selected || branchNow;
  const existing = parseDateTimeValue(value);
  const preservesExisting = existing && selected && formatDateTimeValue(existing) === formatDateTimeValue(selected);
  return {
    now,
    selectedDate: selected ? startOfDay(selected) : null,
    timeParts: selected ? getTimeParts(selected) : EMPTY_TIME,
    visibleMonth: startOfMonth(preservesExisting ? focusDate : branchNow),
    focusedDateKey: formatDateKey(focusDate)
  };
};

const isSameDay = (first, second) => Boolean(first && second) && formatDateKey(first) === formatDateKey(second);
const isStorefrontTimeAvailable = ({ dateTime, schedule, now }) => {
  if (!(dateTime instanceof Date) || !Number.isFinite(dateTime.getTime()) || !schedule) {
    return false;
  }
  const instant = branchWallToInstant(dateTime, getScheduleTimezone(schedule));
  if (!instant || instant.getTime() <= now.getTime()) return false;
  const minuteOfDay = (dateTime.getHours() * 60) + dateTime.getMinutes();
  return intervalRangesForDate(dateTime, schedule)
    .some(([start, end]) => minuteOfDay >= start && minuteOfDay < end);
};
const isSameMonth = (first, second) => Boolean(first && second)
  && first.getFullYear() === second.getFullYear()
  && first.getMonth() === second.getMonth();
const resolveCalendarSwipe = (deltaX, deltaY, threshold = CALENDAR_SWIPE_NAVIGATION_DISTANCE) => {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  if (Math.max(horizontalDistance, verticalDistance) < threshold) return null;
  if (horizontalDistance >= verticalDistance * CALENDAR_SWIPE_AXIS_RATIO) {
    return { axis: 'horizontal', direction: deltaX < 0 ? 1 : -1 };
  }
  if (verticalDistance >= horizontalDistance * CALENDAR_SWIPE_AXIS_RATIO) {
    return { axis: 'vertical', direction: deltaY < 0 ? 1 : -1 };
  }
  return null;
};
const buildCalendarDays = (month) => {
  const first = startOfMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  const calendarStart = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));
};

/**
 * Shared Storefront scheduled-order date/time picker.
 * Available dates and times are constrained by branch hours for every method;
 * dine-in additionally has a finite booking window.
 */
export function StorefrontScheduledDateTimePicker({
  availabilityMode = 'any',
  brandColor = '#1A4E8D',
  brandShadow = 'rgba(21, 87, 155, 0.18)',
  hoursNoticeMessage,
  isResponsive = false,
  onApply,
  onOpenChange,
  open = false,
  scheduleHoursLabel = '',
  storefrontHours,
  leadTimeMinDays = null,
  leadTimeMaxDays = null,
  value = ''
}) {
  const isDineIn = availabilityMode === 'dine_in';
  const schedule = useMemo(() => storefrontHours ? normalizeStorefrontBusinessHours(storefrontHours) : null, [storefrontHours]);
  const [draft, setDraft] = useState(() => buildInitialPickerDraft({
    value,
    schedule,
    leadTimeMinDays,
    leadTimeMaxDays,
    isDineIn
  }));
  const { now, selectedDate, timeParts, visibleMonth, focusedDateKey } = draft;
  const [popoverPosition, setPopoverPosition] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const calendarRef = useRef(null);
  const calendarTouchStartRef = useRef(null);
  const suppressDateClickUntilRef = useRef(0);
  const dateButtonRefs = useRef(new Map());
  const swipeHelpRef = useRef(null);
  const swipeHelpPointerTypeRef = useRef('');
  const swipeHelpOpenBeforePointerRef = useRef(false);
  const focusDateKeyRef = useRef(draft.focusedDateKey);
  const [swipeHelpOpen, setSwipeHelpOpen] = useState(false);
  const id = useId();
  const popoverId = 'storefront-scheduled-date-time-' + id;
  const titleId = popoverId + '-title';
  const labelId = popoverId + '-label';
  const valueId = popoverId + '-value';
  const swipeHelpId = popoverId + '-swipe-help';

  const availableSlots = useMemo(() => (
    selectedDate
      ? buildStorefrontTimeSlots({ date: selectedDate, storefrontHours: schedule, now, intervalMinutes: TIME_PRECISION_MINUTES })
      : []
  ), [now, schedule, selectedDate]);
  const [closedDateMessage, setClosedDateMessage] = useState('');
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const branchNow = getBranchWallDate(now, getScheduleTimezone(schedule));
  const today = startOfDay(branchNow);
  const minimumDate = addDays(today, leadTimeMinDays ?? 0);
  const maximumDate = leadTimeMaxDays != null ? addDays(today, isDineIn ? Math.min(leadTimeMaxDays, MAX_SELECTABLE_DAYS) : leadTimeMaxDays)
    : isDineIn ? addDays(today, MAX_SELECTABLE_DAYS) : null;
  const currentMonth = startOfMonth(today);
  const maximumMonth = maximumDate ? startOfMonth(maximumDate) : null;
  const currentMonthTimestamp = currentMonth.getTime();
  const maximumMonthTimestamp = maximumMonth?.getTime() ?? null;

  const isDateWithinBookingRange = (date) => (
    date.getTime() >= minimumDate.getTime()
    && (!maximumDate || date.getTime() <= maximumDate.getTime())
  );

  const isDateSelectable = (date) => {
    if (!schedule || !isDateWithinBookingRange(date)) return false;
    return hasAvailableSlot({ date, schedule, now });
  };

  const todayShortcut = isDateSelectable(today) ? today : null;
  const tomorrow = addDays(today, 1);
  const tomorrowShortcut = isDateSelectable(tomorrow) ? tomorrow : null;
  const daysUntilNextMonday = ((8 - today.getDay()) % 7) || 7;
  const nextWeekStart = addDays(today, daysUntilNextMonday);
  const nextWeekShortcut = Array.from(
    { length: 7 },
    (_, index) => addDays(nextWeekStart, index)
  ).find(isDateSelectable) || null;
  const dateShortcuts = [
    { key: 'today', label: 'Today', date: todayShortcut },
    { key: 'tomorrow', label: 'Tomorrow', date: tomorrowShortcut },
    { key: 'next-week', label: 'Next Week', date: nextWeekShortcut }
  ];

  const selectedPeriod = timeParts.period || availableSlots[0]?.period || '';
  const slotsForPeriod = availableSlots.filter((slot) => slot.period === selectedPeriod);
  const hourValues = Array.from({ length: 12 }, (_, index) => {
    const hour = String(index + 1);
    return {
      disabled: !slotsForPeriod.some((slot) => hour12ForMinutes(slot.minutes) === hour),
      label: hour,
      value: hour
    };
  });
  const minuteValues = Array.from({ length: 60 }, (_, minute) => {
    const value = pad(minute);
    return {
      disabled: !slotsForPeriod.some((slot) => (
        hour12ForMinutes(slot.minutes) === timeParts.hour && pad(slot.minutes % 60) === value
      )),
      label: value,
      value
    };
  });
  const draftValue = valueFromParts(selectedDate, timeParts);
  const draftDateTime = parseDateTimeValue(draftValue);
  const canApply = Boolean(draftDateTime)
    && isDateWithinBookingRange(startOfDay(draftDateTime))
    && isStorefrontTimeAvailable({ dateTime: draftDateTime, schedule, now });
  const resolvedScheduleHoursLabel = scheduleHoursLabel || (storefrontHours ? formatStorefrontHoursLabel(storefrontHours) : '');
  const storeHoursText = resolvedScheduleHoursLabel || 'Store hours unavailable';
  const scheduleHoursMessage = resolvedScheduleHoursLabel
    ? 'Scheduled orders must be within store hours: ' + resolvedScheduleHoursLabel + '.'
    : '';
  const resolvedHoursNoticeMessage = hoursNoticeMessage ?? scheduleHoursMessage;
  const canGoToPreviousMonth = visibleMonth.getTime() > currentMonth.getTime();
  const canGoToNextMonth = !maximumMonth || visibleMonth.getTime() < maximumMonth.getTime();

  const closePopover = useCallback((restoreFocus = false) => {
    onOpenChange(false);
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, [onOpenChange]);

  const resetDraft = () => {
    setClosedDateMessage('');
    const nextDraft = buildInitialPickerDraft({ value, schedule, leadTimeMinDays, leadTimeMaxDays, isDineIn });
    focusDateKeyRef.current = nextDraft.focusedDateKey;
    setDraft(nextDraft);
  };

  const handleDateSelect = (date) => {
    setClosedDateMessage('');
    const nextDate = startOfDay(date);
    const dateKey = formatDateKey(nextDate);
    const firstSlot = buildStorefrontTimeSlots({
      date: nextDate,
      storefrontHours: schedule,
      now,
      intervalMinutes: TIME_PRECISION_MINUTES
    })[0];
    focusDateKeyRef.current = dateKey;
    setDraft((current) => ({
      ...current,
      selectedDate: nextDate,
      visibleMonth: startOfMonth(nextDate),
      focusedDateKey: dateKey,
      timeParts: firstSlot ? getTimeParts(parseDateTimeValue(firstSlot.value)) : EMPTY_TIME
    }));
  };

  const handlePeriodChange = (period) => {
    const matchingSlots = availableSlots.filter((slot) => slot.period === period);
    const matchingCurrent = matchingSlots.find((slot) => (
      hour12ForMinutes(slot.minutes) === timeParts.hour
      && pad(slot.minutes % 60) === timeParts.minute
    ));
    const nextSlot = matchingCurrent || matchingSlots[0];
    setDraft((current) => ({
      ...current,
      timeParts: nextSlot ? getTimeParts(parseDateTimeValue(nextSlot.value)) : EMPTY_TIME
    }));
  };

  const handleHourChange = (hour) => {
    const matchingSlots = slotsForPeriod.filter((slot) => hour12ForMinutes(slot.minutes) === hour);
    const matchingCurrent = matchingSlots.find((slot) => pad(slot.minutes % 60) === timeParts.minute);
    const nextSlot = matchingCurrent || matchingSlots[0];
    setDraft((current) => ({
      ...current,
      timeParts: nextSlot ? getTimeParts(parseDateTimeValue(nextSlot.value)) : EMPTY_TIME
    }));
  };

  const handleMinuteChange = (minute) => {
    const numericMinute = Number(minute);
    if (!selectedDate || !timeParts.hour || !timeParts.period || !Number.isInteger(numericMinute) || numericMinute < 0 || numericMinute > 59) return;
    const normalizedMinute = pad(numericMinute);
    const candidate = parseDateTimeValue(valueFromParts(selectedDate, { ...timeParts, minute: normalizedMinute }));

    if (candidate
      && isDateWithinBookingRange(startOfDay(candidate))
      && isStorefrontTimeAvailable({ dateTime: candidate, schedule, now })) {
      const selected = startOfDay(candidate);
      const dateKey = formatDateKey(selected);
      focusDateKeyRef.current = dateKey;
      setDraft((current) => ({
        ...current,
        selectedDate: selected,
        visibleMonth: startOfMonth(selected),
        focusedDateKey: dateKey,
        timeParts: getTimeParts(candidate)
      }));
      return;
    }

    setDraft((current) => ({
      ...current,
      timeParts: { ...current.timeParts, minute: pad(numericMinute) }
    }));
  };

  const handleCalendarKeyDown = (event, date) => {
    const deltaByKey = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = deltaByKey[event.key];
    if (!delta) return;
    event.preventDefault();
    const maxSteps = maximumDate ? Math.max(MAX_SELECTABLE_DAYS, leadTimeMaxDays ?? 0) + 7 : (delta < 0 ? 7 : 1);
    for (let step = 1; step <= maxSteps; step += 1) {
      const nextDate = addDays(date, delta * step);
      if (!isDateWithinBookingRange(nextDate)) continue;
      const nextKey = formatDateKey(nextDate);
      focusDateKeyRef.current = nextKey;
      setDraft((current) => ({
        ...current,
        focusedDateKey: nextKey,
        visibleMonth: isSameMonth(nextDate, current.visibleMonth)
          ? current.visibleMonth
          : startOfMonth(nextDate)
      }));
      window.setTimeout(() => dateButtonRefs.current.get(nextKey)?.focus(), 0);
      break;
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = window.setTimeout(() => {
      const dayButton = dateButtonRefs.current.get(focusDateKeyRef.current);
      if (dayButton && !dayButton.disabled) dayButton.focus();
      else popoverRef.current?.querySelector('[data-picker-focus-target="true"]')?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.max(0, Math.min(360, viewportWidth - 24));
      const panelHeight = Math.min(
        popoverRef.current?.getBoundingClientRect().height || 460,
        Math.max(240, viewportHeight - 24)
      );
      const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
      let top = rect.bottom + 8;
      if (top + panelHeight > viewportHeight - 12 && rect.top - panelHeight - 8 >= 12) {
        top = rect.top - panelHeight - 8;
      }
      const maxTop = Math.max(12, viewportHeight - panelHeight - 12);
      top = Math.max(12, Math.min(top, maxTop));
      setPopoverPosition((current) => (
        current && current.left === left && current.top === top && current.width === width
          ? current
          : { left, top, width }
      ));
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (event.target?.closest?.('[data-storefront-picker-overlay="true"]')) return;
      event.preventDefault();
      if (swipeHelpOpen) {
        setSwipeHelpOpen(false);
        return;
      }
      closePopover(true);
    };
    const handlePointerDown = (event) => {
      const target = event.target;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      if (target?.closest?.('[data-storefront-picker-overlay="true"]')) return;
      closePopover(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [closePopover, open, swipeHelpOpen]);

  useEffect(() => {
    if (!open) {
      calendarTouchStartRef.current = null;
      return undefined;
    }

    const calendar = calendarRef.current;
    if (!calendar) return undefined;

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1) {
        calendarTouchStartRef.current = null;
        return;
      }
      const touch = event.touches[0];
      calendarTouchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        axis: null
      };
    };

    const handleTouchMove = (event) => {
      const start = calendarTouchStartRef.current;
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const dominantSwipe = resolveCalendarSwipe(
        deltaX,
        deltaY,
        CALENDAR_SWIPE_CAPTURE_DISTANCE
      );
      if (!start.axis && dominantSwipe) start.axis = dominantSwipe.axis;
      if (start.axis && event.cancelable) event.preventDefault();
    };

    const handleTouchEnd = (event) => {
      const start = calendarTouchStartRef.current;
      calendarTouchStartRef.current = null;
      const touch = event.changedTouches?.[0];
      if (!start || !touch) return;
      const swipe = resolveCalendarSwipe(touch.clientX - start.x, touch.clientY - start.y);
      if (!swipe || (start.axis && swipe.axis !== start.axis)) return;

      suppressDateClickUntilRef.current = Date.now() + 500;
      setDraft((current) => ({
        ...current,
        visibleMonth: (() => {
          const candidate = swipe.axis === 'horizontal'
          ? addMonths(current.visibleMonth, swipe.direction)
          : new Date(
            current.visibleMonth.getFullYear() + swipe.direction,
            current.visibleMonth.getMonth(),
            1
          );
          if (candidate.getTime() < currentMonthTimestamp) return new Date(currentMonthTimestamp);
          if (maximumMonthTimestamp != null && candidate.getTime() > maximumMonthTimestamp) return new Date(maximumMonthTimestamp);
          return candidate;
        })()
      }));
    };

    const handleTouchCancel = () => {
      calendarTouchStartRef.current = null;
    };

    calendar.addEventListener('touchstart', handleTouchStart, { passive: true });
    calendar.addEventListener('touchmove', handleTouchMove, { passive: false });
    calendar.addEventListener('touchend', handleTouchEnd, { passive: true });
    calendar.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    return () => {
      calendar.removeEventListener('touchstart', handleTouchStart);
      calendar.removeEventListener('touchmove', handleTouchMove);
      calendar.removeEventListener('touchend', handleTouchEnd);
      calendar.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [open, currentMonthTimestamp, maximumMonthTimestamp]);

  useEffect(() => {
    if (!swipeHelpOpen) return undefined;
    const handlePointerDown = (event) => {
      if (swipeHelpRef.current?.contains(event.target)) return;
      setSwipeHelpOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [swipeHelpOpen]);

  const handleApply = () => {
    if (!canApply) return;
    onApply(draftValue);
    closePopover(true);
  };

  const popover = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popoverRef}
      id={popoverId}
      role="dialog"
      aria-labelledby={titleId}
      data-testid="scheduled-date-time-popover"
      className="scrollbar-hide"
      style={{
        background: '#fff',
        border: '1px solid #dbe4f0',
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.18)',
        boxSizing: 'border-box',
        color: '#1e293b',
        display: 'grid',
        gap: 10,
        left: popoverPosition?.left ?? 12,
        maxHeight: 'min(80vh, 620px)',
        overflowY: 'auto',
        padding: 12,
        position: 'fixed',
        top: popoverPosition?.top ?? 12,
        visibility: popoverPosition ? 'visible' : 'hidden',
        width: popoverPosition?.width ?? 'min(360px, calc(100vw - 24px))',
        zIndex: 3000,
        fontFamily: CHECKOUT_FONT_FAMILY
      }}
    >
      <div
        data-testid="scheduled-calendar-header"
        style={{ alignItems: 'center', display: 'grid', gap: 4, gridTemplateColumns: '40px minmax(0, 1fr) 40px' }}
      >
        <button
          type="button"
          aria-label="Previous month"
          disabled={!canGoToPreviousMonth}
          onClick={() => setDraft((current) => ({
            ...current,
            visibleMonth: addMonths(current.visibleMonth, -1)
          }))}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{
            alignItems: 'center',
            background: '#fff',
            border: '1px solid #dbe4f0',
            borderRadius: 8,
            color: canGoToPreviousMonth ? '#334155' : '#94a3b8',
            cursor: canGoToPreviousMonth ? 'pointer' : 'not-allowed',
            display: 'inline-flex',
            height: isResponsive ? 40 : 38,
            justifyContent: 'center',
            width: isResponsive ? 40 : 38
          }}
        >
          <ChevronLeft size={17} />
        </button>
        <div style={{ alignItems: 'center', display: 'grid', gap: 6, gridTemplateColumns: '22px auto 22px', justifyContent: 'center', minWidth: 0 }}>
          <span aria-hidden="true" />
          <h3 id={titleId} aria-live="polite" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
            {visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h3>
          <div
            ref={swipeHelpRef}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'mouse') return;
              swipeHelpPointerTypeRef.current = 'mouse';
              setSwipeHelpOpen(true);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== 'mouse') return;
              setSwipeHelpOpen(false);
            }}
            style={{ position: 'relative', flexShrink: 0 }}
          >
            <button
              type="button"
              aria-label="Calendar swipe instructions"
              aria-describedby={swipeHelpOpen ? swipeHelpId : undefined}
              aria-expanded={swipeHelpOpen}
              onPointerDown={(event) => {
                swipeHelpPointerTypeRef.current = event.pointerType;
                if (event.pointerType !== 'mouse') {
                  swipeHelpOpenBeforePointerRef.current = swipeHelpOpen;
                }
              }}
              onFocus={() => setSwipeHelpOpen(true)}
              onBlur={(event) => {
                if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
                  setSwipeHelpOpen(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setSwipeHelpOpen(false);
                  return;
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  swipeHelpPointerTypeRef.current = 'keyboard';
                  setSwipeHelpOpen(true);
                }
              }}
              onClick={() => {
                if (swipeHelpPointerTypeRef.current === 'touch' || swipeHelpPointerTypeRef.current === 'pen') {
                  setSwipeHelpOpen(!swipeHelpOpenBeforePointerRef.current);
                  return;
                }
                setSwipeHelpOpen(true);
              }}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              style={{
                alignItems: 'center',
                background: '#f8fafc',
                border: '1px solid #dbe4f0',
                borderRadius: 999,
                color: '#64748b',
                cursor: 'help',
                display: 'inline-flex',
                height: 22,
                justifyContent: 'center',
                padding: 0,
                width: 22
              }}
            >
              <Info aria-hidden="true" size={13} />
            </button>
            {swipeHelpOpen ? (
              <span
                id={swipeHelpId}
                role="tooltip"
                style={{
                  background: '#0f172a',
                  borderRadius: 8,
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.2)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 500,
                  right: -36,
                  lineHeight: 1.4,
                  padding: '8px 10px',
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  width: 'min(250px, calc(100vw - 52px))',
                  zIndex: 5
                }}
              >
                Swipe left for next month or right for previous month. Swipe up for next year or down for previous year. Dates outside the available booking window or store hours stay unavailable.
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          aria-label="Next month"
          data-picker-focus-target="true"
          disabled={!canGoToNextMonth}
          onClick={() => setDraft((current) => ({
            ...current,
            visibleMonth: addMonths(current.visibleMonth, 1)
          }))}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{
            alignItems: 'center',
            background: '#fff',
            border: '1px solid #dbe4f0',
            borderRadius: 8,
            color: canGoToNextMonth ? '#334155' : '#94a3b8',
            cursor: canGoToNextMonth ? 'pointer' : 'not-allowed',
            display: 'inline-flex',
            height: isResponsive ? 40 : 38,
            justifyContent: 'center',
            width: isResponsive ? 40 : 38
          }}
        >
          <ChevronRight size={17} />
        </button>
      </div>

      <div
        aria-label="Quick date choices"
        data-testid="scheduled-date-shortcuts"
        role="group"
        style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
      >
        {dateShortcuts.map(({ key, label, date }) => {
          const selected = isSameDay(date, selectedDate);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              disabled={!date}
              onClick={() => date && handleDateSelect(date)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              style={{
                background: selected ? brandColor : '#f8fafc',
                border: '1px solid ' + (selected ? brandColor : '#e2e8f0'),
                borderRadius: 8,
                boxSizing: 'border-box',
                color: selected ? '#fff' : date ? '#334155' : '#94a3b8',
                cursor: date ? 'pointer' : 'not-allowed',
                fontFamily: CHECKOUT_FONT_FAMILY,
                fontSize: isResponsive ? 11 : 10,
                fontWeight: 700,
                minHeight: isResponsive ? 32 : 28,
                opacity: date ? 1 : 0.7,
                padding: '0 8px',
                whiteSpace: 'nowrap'
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        ref={calendarRef}
        aria-label="Choose a date"
        data-testid="scheduled-date-calendar"
        onClickCapture={(event) => {
          if (Date.now() >= suppressDateClickUntilRef.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        role="group"
        style={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {DAY_LABELS.map((day) => (
          <div key={day} aria-hidden="true" style={{ color: '#64748b', fontSize: 10, fontWeight: 700, padding: '2px 0 4px', textAlign: 'center' }}>
            {day}
          </div>
        ))}
        {calendarDays.map((date) => {
          const dateKey = formatDateKey(date);
          const selectable = isDateSelectable(date);
          const inBookingRange = isDateWithinBookingRange(date);
          const closed = inBookingRange && !selectable;
          const selected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, branchNow);
          const inMonth = isSameMonth(date, visibleMonth);
          return (
            <button
              key={dateKey}
              ref={(element) => {
                if (element) dateButtonRefs.current.set(dateKey, element);
                else dateButtonRefs.current.delete(dateKey);
              }}
              type="button"
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={selected}
              aria-label={(closed ? schedule ? 'Store closed on ' : 'Store hours unavailable on ' : !inBookingRange && date >= today ? 'Outside scheduling window on ' : 'Select ') + formatLongDate(date)}
              aria-disabled={closed || undefined}
              disabled={!inBookingRange}
              tabIndex={dateKey === focusedDateKey ? 0 : -1}
              onFocus={() => {
                focusDateKeyRef.current = dateKey;
                setDraft((current) => current.focusedDateKey === dateKey
                  ? current
                  : { ...current, focusedDateKey: dateKey });
              }}
              onKeyDown={(event) => handleCalendarKeyDown(event, date)}
              onClick={() => {
                if (closed) {
                  setClosedDateMessage(schedule
                    ? 'The store is closed on ' + formatLongDate(date) + '. Choose an available date.'
                    : 'Business hours are unavailable for this branch. Scheduling is not available.');
                  return;
                }
                if (selectable) handleDateSelect(date);
              }}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              style={{
                alignItems: 'center',
                background: selected ? brandColor : 'transparent',
                border: 0,
                borderRadius: 999,
                color: selected ? '#fff' : selectable && inMonth ? brandColor : '#94a3b8',
                cursor: inBookingRange ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                fontFamily: CHECKOUT_FONT_FAMILY,
                fontSize: 12,
                fontWeight: selected || isToday ? 700 : 500,
                height: isResponsive ? 42 : 36,
                justifyContent: 'center',
                opacity: inMonth ? 1 : 0.68,
                padding: 0,
                width: '100%'
              }}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      {closedDateMessage ? (
        <div role="status" style={{ color: '#475569', fontSize: 11, lineHeight: 1.4 }}>
          {closedDateMessage}
        </div>
      ) : null}

      <div style={{ alignItems: 'center', display: 'grid', gap: 6, gridTemplateColumns: 'auto minmax(0, 72px) auto minmax(0, 72px) minmax(0, 68px)', justifyContent: 'space-between', padding: '0 6px' }}>
        <strong style={{ fontSize: 12, fontWeight: 700 }}>Time</strong>
        <StorefrontTimePickerSelect
          brandColor={brandColor}
          disabled={!selectedDate || availableSlots.length === 0}
          isResponsive={isResponsive}
          label="Hour"
          onChange={handleHourChange}
          options={hourValues}
          placeholder="Hour"
          value={timeParts.hour || ''}
        />
        <span aria-hidden="true" style={{ color: '#64748b', fontSize: 14 }}>:</span>
        <StorefrontTimePickerSelect
          brandColor={brandColor}
          allowCustomInput
          disabled={!selectedDate || !timeParts.hour || availableSlots.length === 0}
          isResponsive={isResponsive}
          label="Minute"
          onChange={handleMinuteChange}
          options={minuteValues}
          placeholder="Min"
          value={timeParts.minute || ''}
        />
        <StorefrontTimePickerSelect
          brandColor={brandColor}
          disabled={!selectedDate || availableSlots.length === 0}
          isResponsive={isResponsive}
          label="AM/PM"
          onChange={handlePeriodChange}
          options={[...new Set(availableSlots.map((slot) => slot.period))]}
          placeholder="AM/PM"
          value={timeParts.period || ''}
        />
      </div>

      {selectedDate || !schedule ? (
        <div role="status" style={{ color: '#64748b', fontSize: 11, lineHeight: 1.4 }}>
          Store hours: {storeHoursText}
          {!schedule ? ' · Scheduling is unavailable until branch hours are set.' : availableSlots.length === 0 ? ' · No times are available on this date.' : !canApply && timeParts.minute ? ' · Choose a time within available store hours.' : ''}
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 10 }}>
        <button
          type="button"
          onClick={() => closePopover(true)}
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            color: '#334155',
            cursor: 'pointer',
            flex: 1,
            fontFamily: CHECKOUT_FONT_FAMILY,
            fontSize: 12,
            fontWeight: 600,
            minHeight: 32,
            padding: '0 8px'
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canApply}
          onClick={handleApply}
          style={{
            background: brandColor,
            border: '1px solid ' + brandColor,
            borderRadius: 8,
            boxShadow: '0 5px 12px ' + brandShadow,
            color: '#fff',
            cursor: canApply ? 'pointer' : 'not-allowed',
            flex: 1,
            fontFamily: CHECKOUT_FONT_FAMILY,
            fontSize: 12,
            fontWeight: 700,
            minHeight: 32,
            opacity: canApply ? 1 : 0.55,
            padding: '0 8px'
          }}
        >
          Apply
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div data-testid="scheduled-date-time-picker" style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', flexDirection: isResponsive ? 'column' : 'row', flexWrap: isResponsive ? 'nowrap' : 'wrap', alignItems: isResponsive ? 'flex-start' : 'center', columnGap: 8, rowGap: 3, minWidth: 0 }}>
          <span id={labelId} style={{ color: '#475569', fontFamily: CHECKOUT_FONT_FAMILY, fontSize: 12, fontWeight: 600 }}>
            Scheduled date and time
          </span>
          {resolvedHoursNoticeMessage ? (
            <span data-testid="scheduled-hours-note" role="note" style={{ color: '#92400e', fontFamily: CHECKOUT_FONT_FAMILY, fontSize: 11, fontWeight: 600, lineHeight: 1.35, minWidth: 0 }}>
              {resolvedHoursNoticeMessage}
            </span>
          ) : null}
        </div>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          aria-labelledby={labelId + ' ' + valueId}
          onClick={() => {
            if (open) {
              setSwipeHelpOpen(false);
              onOpenChange(false);
              return;
            }
            setSwipeHelpOpen(false);
            resetDraft();
            onOpenChange(true);
          }}
          style={{
            alignItems: 'center',
            background: '#fff',
            border: '1px solid ' + (open ? brandColor : '#cbd5e1'),
            borderRadius: 9,
            boxSizing: 'border-box',
            color: '#1e293b',
            cursor: 'pointer',
            display: 'flex',
            gap: 9,
            minHeight: CHECKOUT_CONTROL_MIN_HEIGHT,
            padding: '0 11px',
            textAlign: 'left',
            width: '100%',
            fontFamily: CHECKOUT_FONT_FAMILY
          }}
        >
          <CalendarDays aria-hidden="true" color={brandColor} size={17} />
          <span id={valueId} style={{ flex: 1, fontSize: 13, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatPickerValue(value) || 'Choose a date and time'}
          </span>
          <ChevronDown aria-hidden="true" color="#64748b" size={15} />
        </button>
      </div>
      {popover}
    </>
  );
}
