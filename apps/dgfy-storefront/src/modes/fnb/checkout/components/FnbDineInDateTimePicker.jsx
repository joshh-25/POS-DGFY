import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  Sun,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useModalScrollLock } from '../../../../shared/hooks/useModalScrollLock.js';
import { normalizeStorefrontBusinessHours } from '../../../../shared/model/storefrontHoursModel.js';
import { CHECKOUT_FONT_FAMILY } from '../../../../shared/components/checkout/checkoutUiTokens.js';

const DAY_KEYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
const DAY_LABELS = Object.freeze(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
const SLOT_INTERVAL_MINUTES = 30;
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

const formatShortDate = (date) => date.toLocaleDateString('en-US', {
  day: 'numeric',
  month: 'short'
});

const formatSelectedDateTime = (value) => {
  const date = parseDateTimeValue(value);
  if (!date) return 'Choose a date and time';
  const dateLabel = date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    year: 'numeric'
  });
  return `${dateLabel} at ${formatTime((date.getHours() * 60) + date.getMinutes())}`;
};

const getWeekendDates = (date) => {
  const day = date.getDay();
  const daysUntilSaturday = day === 0 ? 6 : 6 - day;
  const saturday = addDays(date, daysUntilSaturday);
  return [saturday, addDays(saturday, 1)];
};

const isSameDay = (first, second) => Boolean(first && second) && formatDateKey(first) === formatDateKey(second);

const isSameMonth = (first, second) => Boolean(first && second)
  && first.getFullYear() === second.getFullYear()
  && first.getMonth() === second.getMonth();

const buildCalendarDays = (month) => {
  const first = startOfMonth(month);
  const calendarStart = addDays(first, -first.getDay());
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
    const focusTimer = setTimeout(() => closeButtonRef.current?.focus(), 0);
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
  const visibleTimeSlots = selectedDateSlots.filter((slot) => slot.period === timePeriod);
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
    if (quickChoice === 'custom') {
      setActiveQuickChoice('custom');
      return;
    }
    if (quickChoice === 'weekend') {
      const weekendDate = getWeekendDates(now).find((date) => buildDineInTimeSlots({ date, storefrontHours: schedule, now }).length > 0);
      if (weekendDate) selectDate(weekendDate, quickChoice);
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
  const borderColor = '#dbe4f0';
  const selectedDateValue = selectedDateTime ? formatDateTimeValue(selectedDateTime) : '';
  const todayLabel = formatShortDate(minimumDate);
  const tomorrowLabel = formatShortDate(addDays(minimumDate, 1));
  const weekendDates = getWeekendDates(now);
  const weekendLabel = `${formatShortDate(weekendDates[0])} - ${formatShortDate(weekendDates[1])}`;
  const storeHoursText = scheduleHoursLabel || schedule.display || 'Store hours unavailable';

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        alignItems: 'center',
        background: 'rgba(15, 23, 42, 0.52)',
        display: 'flex',
        inset: 0,
        justifyContent: 'center',
        overflowY: 'auto',
        padding: isResponsive ? 10 : 16,
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
          border: `1px solid ${borderColor}`,
          borderRadius: isResponsive ? 20 : 22,
          boxShadow: '0 28px 90px rgba(15, 23, 42, 0.28)',
          color: textColor,
          display: 'grid',
          gap: isResponsive ? 12 : 14,
          maxHeight: 'calc(100vh - 20px)',
          maxWidth: 920,
          overflowY: 'auto',
          padding: isResponsive ? 12 : 18,
          width: '100%'
        }}
      >
        <div style={{ alignItems: 'flex-start', display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 10, minWidth: 0 }}>
            <div style={{ alignItems: 'center', background: accentSoft, borderRadius: 14, color: brandColor, display: 'flex', flexShrink: 0, height: isResponsive ? 44 : 48, justifyContent: 'center', width: isResponsive ? 44 : 48 }}>
              <CalendarDays size={isResponsive ? 24 : 26} strokeWidth={1.8} />
            </div>
            <div style={{ display: 'grid', minWidth: 0 }}>
              <h2 id="dine-in-date-time-title" style={{ color: textColor, fontSize: isResponsive ? 20 : 26, letterSpacing: '-0.04em', lineHeight: 1.05, margin: 0 }}>Choose your date &amp; time</h2>
            </div>
          </div>
          <div style={{ alignItems: 'flex-end', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close date and time picker"
              onClick={onClose}
              style={{ ...buttonBaseStyle, background: '#fff', borderRadius: 999, color: mutedColor, height: 32, width: 32 }}
            >
              <X size={21} />
            </button>
          </div>
        </div>

        <div style={{ alignItems: 'center', border: `1px solid ${borderColor}`, borderRadius: 12, display: 'flex', gap: 10, minHeight: isResponsive ? 50 : 52, padding: '0 12px' }}>
          <CalendarDays color={brandColor} size={18} />
          <div style={{ flex: 1, fontSize: isResponsive ? 13 : 15, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatSelectedDateTime(selectedDateValue)}</div>
        </div>

        <div style={{ alignItems: 'stretch', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { id: 'today', icon: <Sun size={18} />, label: 'Today', sublabel: todayLabel },
            { id: 'tomorrow', icon: <CalendarDays size={18} />, label: 'Tomorrow', sublabel: tomorrowLabel },
            { id: 'weekend', icon: <CalendarDays size={18} />, label: 'This Weekend', sublabel: weekendLabel },
            { id: 'custom', icon: <Clock3 size={18} />, label: 'Custom date', sublabel: '' }
          ].map((choice) => {
            const active = activeQuickChoice === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectQuickDate(choice.id)}
                style={{
                  ...buttonBaseStyle,
                  background: active ? accentSoft : '#fff',
                  border: `1px solid ${active ? 'transparent' : borderColor}`,
                  borderRadius: 999,
                  color: active ? brandColor : '#3d4a65',
                  flex: isResponsive ? '1 1 calc(50% - 4px)' : choice.id === 'custom' ? '0 1 185px' : '0 1 170px',
                  gap: 8,
                  justifyContent: 'flex-start',
                  minHeight: isResponsive ? 54 : 50,
                  padding: '7px 12px',
                  textAlign: 'left'
                }}
              >
                <span style={{ alignItems: 'center', display: 'inline-flex', flexShrink: 0, justifyContent: 'center' }}>{choice.icon}</span>
                <span style={{ display: 'grid', gap: 2 }}>
                  <strong style={{ fontSize: 12 }}>{choice.label}</strong>
                  {choice.sublabel ? <span style={{ color: active ? brandColor : mutedColor, fontSize: 11 }}>{choice.sublabel}</span> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ border: `1px solid ${borderColor}`, borderRadius: 16, display: 'grid', gridTemplateColumns: isResponsive ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gap: 12, padding: isResponsive ? 12 : 14 }}>
            <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
              <button
                type="button"
                aria-label="Previous month"
                disabled={!canGoToPreviousMonth}
                onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
                style={{ ...buttonBaseStyle, background: 'transparent', borderRadius: 999, color: canGoToPreviousMonth ? textColor : '#b6c0d1', height: 28, width: 28 }}
              >
                <ChevronLeft size={18} />
              </button>
              <strong style={{ fontSize: isResponsive ? 16 : 18 }}>{visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
              <button
                type="button"
                aria-label="Next month"
                disabled={!canGoToNextMonth}
                onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
                style={{ ...buttonBaseStyle, background: 'transparent', borderRadius: 999, color: canGoToNextMonth ? textColor : '#b6c0d1', height: 28, width: 28 }}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 3, gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {DAY_LABELS.map((label) => <div key={label} style={{ color: mutedColor, fontSize: 10, fontWeight: 800, padding: '0 0 2px', textAlign: 'center' }}>{label}</div>)}
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
                    aria-label={`Select ${formatLongDate(date)}`}
                    disabled={!selectable}
                    onClick={() => selectDate(date)}
                    style={{
                      ...buttonBaseStyle,
                      background: selected ? brandColor : today ? accentSoft : 'transparent',
                      borderRadius: 999,
                      color: selected ? '#fff' : selectable && inMonth ? textColor : '#b5bfd1',
                      fontSize: 13,
                      fontWeight: selected || today ? 800 : 600,
                      height: isResponsive ? 34 : 32,
                      opacity: inMonth ? 1 : 0.78,
                      width: '100%'
                    }}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div style={{ alignItems: 'flex-start', color: mutedColor, display: 'flex', fontSize: 11, gap: 6, lineHeight: 1.35 }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Times outside store hours or already in the past are unavailable.</span>
            </div>
          </div>

          <div style={{ borderLeft: isResponsive ? 0 : `1px solid ${borderColor}`, borderTop: isResponsive ? `1px solid ${borderColor}` : 0, display: 'grid', gap: 12, gridTemplateRows: 'auto max-content minmax(0, 1fr)', padding: isResponsive ? 12 : 14 }}>
            <div style={{ alignItems: 'flex-start', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                <div style={{ alignItems: 'center', background: accentSoft, borderRadius: 999, color: brandColor, display: 'flex', height: 34, justifyContent: 'center', width: 34 }}><Clock3 size={18} /></div>
                <div style={{ display: 'grid', gap: 3 }}>
                  <strong style={{ fontSize: isResponsive ? 16 : 18 }}>Select a time</strong>
                  <span style={{ color: mutedColor, fontSize: 11 }}>{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
              <div style={{ color: mutedColor, display: 'grid', fontSize: 11, gap: 2, textAlign: 'right' }}>
                <strong style={{ alignItems: 'center', color: '#3d4a65', display: 'inline-flex', gap: 3, justifyContent: 'flex-end' }}>Store hours <Info size={12} /></strong>
                <span>{storeHoursText}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {[
                { id: 'AM', label: 'AM' },
                { id: 'PM', label: 'PM' },
                { id: 'ALL_DAY', label: 'All day' }
              ].map((option) => {
                const isAllDay = option.id === 'ALL_DAY';
                const active = timePeriod === option.id;
                const hasSlots = isAllDay || selectedDateSlots.some((slot) => slot.period === option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    disabled={isAllDay || !hasSlots}
                    onClick={() => setTimePeriod(option.id)}
                    style={{
                      ...buttonBaseStyle,
                      background: active ? brandColor : '#f7f8fc',
                      border: `1px solid ${active ? brandColor : 'transparent'}`,
                      borderRadius: 999,
                      color: active ? '#fff' : hasSlots ? '#53617c' : '#b7c0d0',
                      cursor: isAllDay || !hasSlots ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      fontWeight: 800,
                      minHeight: 32,
                      opacity: isAllDay ? 0.62 : 1
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {visibleTimeSlots.length > 0 ? (
              <div style={{ display: 'grid', gap: 7, gridTemplateColumns: isResponsive ? 'repeat(3, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', maxHeight: isResponsive ? 190 : 220, overflowY: 'auto', padding: '2px 2px 4px' }}>
                {visibleTimeSlots.map((slot) => {
                  const active = draftValue === slot.value;
                  return (
                    <button
                      key={slot.value}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Select ${slot.label}`}
                      onClick={() => setDraftValue(slot.value)}
                      style={{
                        ...buttonBaseStyle,
                        background: active ? brandColor : '#fff',
                        border: `1px solid ${active ? brandColor : borderColor}`,
                        borderRadius: 10,
                        boxShadow: active ? `0 8px 18px ${brandShadow}` : 'none',
                        color: active ? '#fff' : '#33415d',
                        fontSize: 13,
                        fontWeight: active ? 800 : 600,
                        minHeight: 38,
                        padding: '0 6px'
                      }}
                    >
                      {slot.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ alignItems: 'center', background: '#f8fafc', borderRadius: 16, color: mutedColor, display: 'flex', fontSize: 13, justifyContent: 'center', minHeight: 120, padding: 18, textAlign: 'center' }}>
                No {timePeriod === 'AM' ? 'morning' : 'afternoon/evening'} times are available for this date.
              </div>
            )}
          </div>
        </div>

        {error ? <div role="alert" style={{ color: '#9f1239', fontSize: 13, fontWeight: 700 }}>{error}</div> : null}

        <div style={{ alignItems: isResponsive ? 'stretch' : 'center', display: 'flex', flexDirection: isResponsive ? 'column' : 'row', gap: 10, justifyContent: 'flex-end' }}>
          <div style={{ alignItems: 'center', display: 'flex', flexDirection: isResponsive ? 'column-reverse' : 'row', gap: 8, width: isResponsive ? '100%' : 'auto' }}>
            <button type="button" onClick={onClose} style={{ ...buttonBaseStyle, background: '#f4f6fa', borderRadius: 999, color: '#4d5b76', fontSize: 13, fontWeight: 800, minHeight: 42, padding: '0 20px', width: isResponsive ? '100%' : 'auto' }}>Cancel</button>
            <button
              type="button"
              disabled={!draftValue}
              onClick={() => onConfirm(draftValue)}
              style={{ ...buttonBaseStyle, background: brandColor, borderRadius: 999, boxShadow: `0 8px 18px ${brandShadow}`, color: '#fff', fontSize: 13, fontWeight: 800, gap: 8, minHeight: 42, opacity: draftValue ? 1 : 0.55, padding: '0 18px', width: isResponsive ? '100%' : 'auto' }}
            >
              Confirm Date &amp; Time <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
