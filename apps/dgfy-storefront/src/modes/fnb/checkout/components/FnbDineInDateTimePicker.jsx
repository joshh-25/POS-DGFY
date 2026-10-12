import {
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useModalScrollLock } from '../../../../shared/hooks/useModalScrollLock.js';
import { normalizeStorefrontBusinessHours } from '../../../../shared/model/storefrontHoursModel.js';
import { CHECKOUT_FONT_FAMILY } from '../../../../shared/components/checkout/checkoutUiTokens.js';

const DAY_KEYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
const DAY_LABELS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const SLOT_INTERVAL_MINUTES = 1;
const MAX_SELECTABLE_DAYS = 90;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const pad = (value) => String(value).padStart(2, '0');

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date, amount) => {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1);

const formatDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

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
    if (Number.isFinite(date.getTime()) && formatDateTimeValue(date) === `${localMatch[1]}-${localMatch[2]}-${localMatch[3]}T${localMatch[4]}:${localMatch[5]}`) {
      return date;
    }
  }

  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const formatDateTimeValue = (date) => `${formatDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const parseMinutes = (value) => {
  const match = String(value || '').trim().match(TIME_PATTERN);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return (hour * 60) + minute;
};

const formatTime = (minutes) => {
  const safeMinutes = Number(minutes);
  const hour24 = Math.floor(safeMinutes / 60) % 24;
  const minute = safeMinutes % 60;
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${pad(minute)} ${meridiem}`;
};

const periodForMinutes = (minutes) => (Number(minutes) >= 12 * 60 ? 'PM' : 'AM');

const hour12ForSlot = (slot) => {
  const hour24 = Math.floor(Number(slot?.minutes || 0) / 60) % 24;
  return hour24 % 12 || 12;
};

const minuteForSlot = (slot) => Number(slot?.minutes || 0) % 60;

const intervalRangesForDate = (date, schedule) => {
  const todayKey = DAY_KEYS[date.getDay()];
  const yesterdayKey = DAY_KEYS[(date.getDay() + 6) % 7];
  const today = schedule?.weekly?.[todayKey];
  const yesterday = schedule?.weekly?.[yesterdayKey];
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

  appendIntervals(today);
  appendIntervals(yesterday, true);
  return ranges
    .sort((first, second) => first[0] - second[0])
    .filter(([start, end], index, all) => index === 0 || start !== all[index - 1][0] || end !== all[index - 1][1]);
};

export const buildDineInTimeSlots = ({ date, storefrontHours, now = new Date() } = {}) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return [];
  const schedule = normalizeStorefrontBusinessHours(storefrontHours);
  const slots = [];
  const seen = new Set();
  intervalRangesForDate(date, schedule).forEach(([start, end]) => {
    const firstSlot = Math.ceil(start / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;
    for (let minutes = firstSlot; minutes < end; minutes += SLOT_INTERVAL_MINUTES) {
      const slotDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60);
      if (slotDate.getTime() <= now.getTime()) continue;
      const value = formatDateTimeValue(slotDate);
      if (seen.has(value)) continue;
      seen.add(value);
      slots.push({
        date,
        label: formatTime(minutes),
        minutes,
        period: periodForMinutes(minutes),
        value
      });
    }
  });
  return slots.sort((first, second) => first.minutes - second.minutes);
};

const resolveFirstAvailableValue = ({ startDate, storefrontHours, now }) => {
  for (let offset = 0; offset <= MAX_SELECTABLE_DAYS; offset += 1) {
    const date = addDays(startDate, offset);
    const slots = buildDineInTimeSlots({ date, storefrontHours, now });
    if (slots.length > 0) return slots[0].value;
  }
  return '';
};

const resolveInitialValue = ({ value, storefrontHours, now }) => {
  const existing = parseDateTimeValue(value);
  if (existing) {
    const existingValue = formatDateTimeValue(existing);
    const matchingSlot = buildDineInTimeSlots({
      date: startOfDay(existing),
      storefrontHours,
      now
    }).find((slot) => slot.value === existingValue);
    if (matchingSlot) return matchingSlot.value;
  }
  return resolveFirstAvailableValue({
    startDate: existing && existing.getTime() > now.getTime() ? startOfDay(existing) : startOfDay(now),
    storefrontHours,
    now
  });
};

const formatLongDate = (date) => date.toLocaleDateString('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

const getNextWeekDates = (date) => {
  const day = date.getDay();
  const daysUntilNextMonday = ((8 - day) % 7) || 7;
  const nextMonday = addDays(date, daysUntilNextMonday);
  return Array.from({ length: 7 }, (_, index) => addDays(nextMonday, index));
};

const isSameDay = (first, second) => Boolean(first && second) && formatDateKey(first) === formatDateKey(second);

const isSameMonth = (first, second) => Boolean(first && second)
  && first.getFullYear() === second.getFullYear()
  && first.getMonth() === second.getMonth();

const buildCalendarDays = (month) => {
  const first = startOfMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  const calendarStart = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));
};

const buttonBaseStyle = {
  alignItems: 'center',
  border: 0,
  cursor: 'pointer',
  display: 'inline-flex',
  fontFamily: CHECKOUT_FONT_FAMILY,
  justifyContent: 'center'
};

const TIME_WHEEL_ITEM_HEIGHT = 42;
const TIME_WHEEL_VISIBLE_ITEMS = 3;

function TimeWheelColumn({
  ariaLabel,
  brandColor,
  mutedColor,
  onSelect,
  options,
  selectedValue,
  textColor
}) {
  const scrollRef = useRef(null);
  const settleTimerRef = useRef(null);
  const suppressScrollRef = useRef(false);
  const suppressScrollTimerRef = useRef(null);
  const selectedIndex = options.findIndex((option) => String(option.value) === String(selectedValue));

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || selectedIndex < 0) return;
    container.scrollTop = selectedIndex * TIME_WHEEL_ITEM_HEIGHT;
  }, [options, selectedIndex]);

  useEffect(() => () => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    if (suppressScrollTimerRef.current) window.clearTimeout(suppressScrollTimerRef.current);
  }, []);

  const selectClosestOption = () => {
    const container = scrollRef.current;
    if (!container || options.length === 0) return;
    const nextIndex = Math.max(0, Math.min(
      options.length - 1,
      Math.round(container.scrollTop / TIME_WHEEL_ITEM_HEIGHT)
    ));
    const nextOption = options[nextIndex]?.disabled
      ? options
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => !option.disabled)
        .sort((left, right) => Math.abs(left.index - nextIndex) - Math.abs(right.index - nextIndex))[0]?.option
      : options[nextIndex];
    if (nextOption && !nextOption.disabled && String(nextOption.value) !== String(selectedValue)) onSelect(nextOption.value);
  };

  const handleScroll = () => {
    const container = scrollRef.current;
    if (suppressScrollRef.current) {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      return;
    }
    const selectedScrollTop = selectedIndex * TIME_WHEEL_ITEM_HEIGHT;
    if (container && selectedIndex >= 0 && Math.abs(container.scrollTop - selectedScrollTop) < 1) {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      return;
    }
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(selectClosestOption, 90);
  };

  const handleOptionClick = (option, index) => {
    if (option.disabled) return;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    suppressScrollRef.current = true;
    if (suppressScrollTimerRef.current) window.clearTimeout(suppressScrollTimerRef.current);
    suppressScrollTimerRef.current = window.setTimeout(() => {
      suppressScrollRef.current = false;
      suppressScrollTimerRef.current = null;
    }, 250);
    if (scrollRef.current) scrollRef.current.scrollTop = index * TIME_WHEEL_ITEM_HEIGHT;
    onSelect(option.value);
  };

  return (
    <div style={{ minWidth: 0, position: 'relative' }}>
      <div
        ref={scrollRef}
        className="dine-in-time-wheel"
        role="listbox"
        aria-label={ariaLabel}
        aria-orientation="vertical"
        onScroll={handleScroll}
        style={{
          height: TIME_WHEEL_ITEM_HEIGHT * TIME_WHEEL_VISIBLE_ITEMS,
          overflowY: 'auto',
          overscrollBehaviorY: 'contain',
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div aria-hidden="true" style={{ height: TIME_WHEEL_ITEM_HEIGHT }} />
        {options.map((option, index) => {
          const active = String(option.value) === String(selectedValue);
          return (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={active}
              disabled={option.disabled}
              onClick={() => handleOptionClick(option, index)}
              style={{
                ...buttonBaseStyle,
                background: 'transparent',
                color: option.disabled ? '#b7c0d0' : active ? textColor : mutedColor,
                cursor: option.disabled ? 'not-allowed' : 'pointer',
                fontSize: active ? 18 : 14,
                fontWeight: active ? 800 : 600,
                minHeight: TIME_WHEEL_ITEM_HEIGHT,
                opacity: option.disabled ? 0.65 : 1,
                padding: '0 6px',
                scrollSnapAlign: 'start',
                transition: 'color 160ms ease, font-size 160ms ease',
                width: '100%'
              }}
            >
              {option.label}
            </button>
          );
        })}
        <div aria-hidden="true" style={{ height: TIME_WHEEL_ITEM_HEIGHT }} />
      </div>
      <div
        aria-hidden="true"
        style={{
          borderBottom: `1px solid ${brandColor}`,
          borderTop: `1px solid ${brandColor}`,
          borderRadius: 10,
          inset: `${TIME_WHEEL_ITEM_HEIGHT}px 0 auto`,
          height: TIME_WHEEL_ITEM_HEIGHT,
          opacity: 0.35,
          pointerEvents: 'none',
          position: 'absolute'
        }}
      />
      <div
        aria-hidden="true"
        style={{
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.96), rgba(255,255,255,0) 38%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.96))',
          inset: 0,
          pointerEvents: 'none',
          position: 'absolute'
        }}
      />
    </div>
  );
}

export function FnbDineInDateTimePicker({
  brandColor = '#0f766e',
  brandShadow = 'rgba(15, 118, 110, 0.18)',
  error = '',
  isResponsive = false,
  onClose,
  onConfirm,
  open = false,
  scheduleHoursLabel = '',
  storefrontHours,
  value = ''
}) {
  useModalScrollLock(open);

  const [now] = useState(() => new Date());
  const closeButtonRef = useRef(null);
  const calendarHeaderRef = useRef(null);
  const schedule = useMemo(() => normalizeStorefrontBusinessHours(storefrontHours), [storefrontHours]);
  const initialValue = useMemo(() => resolveInitialValue({ value, storefrontHours: schedule, now }), [schedule, value, now]);
  const initialDate = parseDateTimeValue(initialValue) || startOfDay(now);
  const [draftValue, setDraftValue] = useState(initialValue);
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(initialDate));
  const [timePeriod, setTimePeriod] = useState(periodForMinutes((initialDate.getHours() * 60) + initialDate.getMinutes()));
  const [activeQuickChoice, setActiveQuickChoice] = useState('custom');

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const focusTimer = setTimeout(() => calendarHeaderRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && previouslyFocused !== document.body && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [onClose, open]);

  const selectedDateTime = parseDateTimeValue(draftValue);
  const selectedDate = selectedDateTime || startOfDay(now);
  const minimumDate = startOfDay(now);
  const maximumDate = addDays(minimumDate, MAX_SELECTABLE_DAYS);
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const selectedDateSlots = useMemo(() => buildDineInTimeSlots({
    date: selectedDate,
    storefrontHours: schedule,
    now
  }), [now, schedule, selectedDate]);
  const availablePeriods = ['AM', 'PM'].filter((period) => selectedDateSlots.some((slot) => slot.period === period));
  const resolvedTimePeriod = availablePeriods.includes(timePeriod) ? timePeriod : (availablePeriods[0] || 'AM');
  const visibleTimeSlots = selectedDateSlots.filter((slot) => slot.period === resolvedTimePeriod);
  const currentMonth = startOfMonth(minimumDate);
  const maximumMonth = startOfMonth(maximumDate);
  const canGoToPreviousMonth = visibleMonth.getTime() > currentMonth.getTime();
  const canGoToNextMonth = visibleMonth.getTime() < maximumMonth.getTime();

  const selectDate = (date, quickChoice = 'custom') => {
    const slots = buildDineInTimeSlots({ date, storefrontHours: schedule, now });
    const nextSlot = slots[0] || null;
    setVisibleMonth(startOfMonth(date));
    setActiveQuickChoice(quickChoice);
    setDraftValue(nextSlot?.value || '');
    setTimePeriod(nextSlot?.period || 'AM');
  };

  const selectQuickDate = (quickChoice) => {
    if (quickChoice === 'next-week') {
      const nextWeekDate = getNextWeekDates(now).find((date) => buildDineInTimeSlots({
        date,
        storefrontHours: schedule,
        now
      }).length > 0);
      if (nextWeekDate) selectDate(nextWeekDate, quickChoice);
      return;
    }
    const date = quickChoice === 'tomorrow' ? addDays(now, 1) : minimumDate;
    selectDate(date, quickChoice);
  };

  const isDateSelectable = (date) => {
    if (date.getTime() < minimumDate.getTime() || date.getTime() > maximumDate.getTime()) return false;
    return buildDineInTimeSlots({ date, storefrontHours: schedule, now }).length > 0;
  };

  if (!open) return null;

  const accentSoft = '#e6f7ef';
  const textColor = '#17213c';
  const mutedColor = '#66748f';
  const storeHoursText = scheduleHoursLabel || schedule.display || 'Store hours unavailable';
  const todayShortcut = isDateSelectable(minimumDate) ? minimumDate : null;
  const tomorrow = addDays(minimumDate, 1);
  const tomorrowShortcut = isDateSelectable(tomorrow) ? tomorrow : null;
  const nextWeekShortcut = getNextWeekDates(now).find((date) => isDateSelectable(date)) || null;
  const dateShortcuts = [
    { key: 'today', label: 'Today', date: todayShortcut },
    { key: 'tomorrow', label: 'Tomorrow', date: tomorrowShortcut },
    { key: 'next-week', label: 'Next Week', date: nextWeekShortcut }
  ];
  const currentVisibleSlot = visibleTimeSlots.find((slot) => slot.value === draftValue) || visibleTimeSlots[0] || null;
  const currentHour = currentVisibleSlot ? hour12ForSlot(currentVisibleSlot) : null;
  const hourOptions = Array.from({ length: 12 }, (_, index) => {
    const hour = index + 1;
    return {
      value: String(hour),
      label: String(hour),
      disabled: !visibleTimeSlots.some((slot) => hour12ForSlot(slot) === hour)
    };
  });
  const minuteOptions = Array.from({ length: 60 }, (_, minute) => ({
    value: String(minute),
    label: pad(minute),
    disabled: !currentHour || !visibleTimeSlots.some((slot) => (
      hour12ForSlot(slot) === currentHour && minuteForSlot(slot) === minute
    ))
  }));
  const periodOptions = [
    ...availablePeriods.map((period) => ({ value: period, label: period })),
    { value: 'ALL_DAY', label: 'All day', disabled: true }
  ];

  const selectWheelPeriod = (nextPeriod) => {
    const nextSlots = selectedDateSlots.filter((slot) => slot.period === nextPeriod);
    if (nextSlots.length === 0) return;
    const currentHour = currentVisibleSlot ? hour12ForSlot(currentVisibleSlot) : null;
    const currentMinute = currentVisibleSlot ? minuteForSlot(currentVisibleSlot) : null;
    const nextSlot = nextSlots.find((slot) => (
      hour12ForSlot(slot) === currentHour && minuteForSlot(slot) === currentMinute
    )) || nextSlots[0];
    setTimePeriod(nextPeriod);
    setDraftValue(nextSlot.value);
  };

  const selectWheelHour = (nextHour) => {
    const hour = Number(nextHour);
    const currentMinute = currentVisibleSlot ? minuteForSlot(currentVisibleSlot) : null;
    const nextSlot = visibleTimeSlots
      .filter((slot) => hour12ForSlot(slot) === hour)
      .find((slot) => minuteForSlot(slot) === currentMinute)
      || visibleTimeSlots.find((slot) => hour12ForSlot(slot) === hour);
    if (nextSlot) setDraftValue(nextSlot.value);
  };

  const selectWheelMinute = (nextMinute) => {
    if (!currentVisibleSlot) return;
    const minute = Number(nextMinute);
    const currentHour = hour12ForSlot(currentVisibleSlot);
    const nextSlot = visibleTimeSlots.find((slot) => (
      hour12ForSlot(slot) === currentHour && minuteForSlot(slot) === minute
    ));
    if (nextSlot) setDraftValue(nextSlot.value);
  };

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        background: 'rgba(15, 23, 42, 0.16)',
        inset: 0,
        position: 'fixed',
        zIndex: 2400
      }}
    >
      <div
        role="dialog"
        aria-labelledby="dine-in-date-time-title"
        aria-modal="true"
        style={{
          background: '#fff',
          border: '1px solid #dbe4f0',
          borderRadius: 12,
          boxShadow: '0 16px 40px rgba(15, 23, 42, 0.18)',
          color: textColor,
          display: 'grid',
          gap: 10,
          left: '50%',
          maxHeight: 'min(80vh, 560px)',
          overflowY: 'auto',
          padding: 12,
          position: 'absolute',
          top: isResponsive ? 12 : '50%',
          transform: isResponsive ? 'translateX(-50%)' : 'translate(-50%, -50%)',
          width: 'min(360px, calc(100vw - 24px))'
        }}
      >
        <style>{'.dine-in-time-wheel::-webkit-scrollbar { display: none; }'}</style>
        <div ref={calendarHeaderRef} data-testid="scheduled-calendar-header" tabIndex={-1} style={{ alignItems: 'center', display: 'grid', gap: 4, gridTemplateColumns: '40px minmax(0, 1fr) 40px', outline: 'none' }}>
          <button
            type="button"
            aria-label="Previous month"
            disabled={!canGoToPreviousMonth}
            onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
            style={{ ...buttonBaseStyle, background: '#fff', border: '1px solid #dbe4f0', borderRadius: 8, color: canGoToPreviousMonth ? '#334155' : '#94a3b8', height: isResponsive ? 40 : 38, width: isResponsive ? 40 : 38 }}
          >
            <ChevronLeft size={17} />
          </button>
          <div style={{ alignItems: 'center', display: 'grid', gap: 6, gridTemplateColumns: '22px auto 22px', justifyContent: 'center', minWidth: 0 }}>
            <span aria-hidden="true" />
            <h3 id="dine-in-date-time-title" aria-live="polite" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
              {visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <button
              type="button"
              aria-label="Calendar information"
              title="Dates outside store hours or already in the past are unavailable."
              style={{ ...buttonBaseStyle, background: '#f8fafc', border: '1px solid #dbe4f0', borderRadius: 999, color: '#64748b', cursor: 'help', height: 22, padding: 0, width: 22 }}
            >
              <Info aria-hidden="true" size={13} />
            </button>
          </div>
          <button
            type="button"
            aria-label="Next month"
            disabled={!canGoToNextMonth}
            onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
            style={{ ...buttonBaseStyle, background: '#fff', border: '1px solid #dbe4f0', borderRadius: 8, color: canGoToNextMonth ? '#334155' : '#94a3b8', height: isResponsive ? 40 : 38, width: isResponsive ? 40 : 38 }}
          >
            <ChevronRight size={17} />
          </button>
        </div>

        <div aria-label="Quick date choices" data-testid="scheduled-date-shortcuts" role="group" style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {dateShortcuts.map(({ key, label, date }) => {
            const active = activeQuickChoice === key || (date && isSameDay(date, selectedDate));
            return (
              <button
                key={key}
                type="button"
                aria-pressed={Boolean(active)}
                disabled={!date}
                onClick={() => date && selectQuickDate(key)}
                style={{
                  ...buttonBaseStyle,
                  background: active ? brandColor : '#f8fafc',
                  border: '1px solid ' + (active ? brandColor : '#e2e8f0'),
                  borderRadius: 8,
                  color: active ? '#fff' : date ? '#334155' : '#94a3b8',
                  cursor: date ? 'pointer' : 'not-allowed',
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

        <div style={{ display: 'grid', gap: 8 }}>

            <div aria-label="Choose a date" data-testid="scheduled-date-calendar" role="group" style={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {DAY_LABELS.map((label) => <div key={label} aria-hidden="true" style={{ color: mutedColor, fontSize: 10, fontWeight: 700, padding: '2px 0 4px', textAlign: 'center' }}>{label}</div>)}
              {calendarDays.map((date) => {
                const selectable = isDateSelectable(date);
                const selected = isSameDay(date, selectedDate);
                const today = isSameDay(date, minimumDate);
                const inMonth = isSameMonth(date, visibleMonth);
                return (
                  <button
                    key={formatDateKey(date)}
                    type="button"
                    aria-current={today ? 'date' : undefined}
                    aria-label={'Select ' + formatLongDate(date)}
                    disabled={!selectable}
                    onClick={() => selectDate(date)}
                    style={{
                      ...buttonBaseStyle,
                      background: selected ? brandColor : today ? accentSoft : 'transparent',
                      borderRadius: 999,
                      color: selected ? '#fff' : selectable && inMonth ? brandColor : '#94a3b8',
                      fontSize: 12,
                      fontWeight: selected || today ? 700 : 500,
                      height: isResponsive ? 42 : 36,
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

            <div style={{ color: mutedColor, fontSize: 11, lineHeight: 1.4 }}>
              Times outside store hours or already in the past are unavailable.
            </div>
          </div>

          <div style={{ alignItems: 'center', display: 'grid', gap: 6, gridTemplateColumns: 'auto minmax(0, 72px) auto minmax(0, 72px) minmax(0, 68px)', justifyContent: 'space-between', padding: '0 6px' }}>
            <strong style={{ fontSize: 12, fontWeight: 700 }}>Time</strong>
            <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
              <span style={{ color: mutedColor, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>Hour</span>
              <TimeWheelColumn
                ariaLabel="Hour"
                brandColor={brandColor}
                mutedColor={mutedColor}
                onSelect={selectWheelHour}
                options={hourOptions}
                selectedValue={currentVisibleSlot ? String(hour12ForSlot(currentVisibleSlot)) : ''}
                textColor={textColor}
              />
            </div>
            <span aria-hidden="true" style={{ color: mutedColor, fontSize: 14 }}>:</span>
            <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
              <span style={{ color: mutedColor, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>Minute</span>
              <TimeWheelColumn
                ariaLabel="Minute"
                brandColor={brandColor}
                mutedColor={mutedColor}
                onSelect={selectWheelMinute}
                options={minuteOptions}
                selectedValue={currentVisibleSlot ? String(minuteForSlot(currentVisibleSlot)) : ''}
                textColor={textColor}
              />
            </div>
            <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
              <span style={{ color: mutedColor, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>AM/PM</span>
              <TimeWheelColumn
                ariaLabel="AM or PM"
                brandColor={brandColor}
                mutedColor={mutedColor}
                onSelect={selectWheelPeriod}
                options={periodOptions}
                selectedValue={resolvedTimePeriod}
                textColor={textColor}
              />
            </div>
          </div>
          <div role="status" style={{ color: mutedColor, fontSize: 11, lineHeight: 1.4 }}>
            Store hours: {storeHoursText}
            {visibleTimeSlots.length === 0 ? ' · No times are available on this date.' : ''}
          </div>
        {error ? <div role="alert" style={{ color: '#9f1239', fontSize: 13, fontWeight: 700 }}>{error}</div> : null}

        <div style={{ borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 10 }}>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            style={{ ...buttonBaseStyle, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#334155', flex: 1, fontSize: 13, fontWeight: 600, minHeight: 42, padding: '0 12px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!draftValue}
            onClick={() => onConfirm(draftValue)}
            style={{ ...buttonBaseStyle, background: brandColor, border: '1px solid ' + brandColor, borderRadius: 8, boxShadow: '0 5px 12px ' + brandShadow, color: '#fff', flex: 1, fontSize: 13, fontWeight: 700, minHeight: 42, opacity: draftValue ? 1 : 0.55, padding: '0 12px' }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
