import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CALENDAR_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' }
];

const parseDateInput = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[3])
    ? date
    : null;
};

const dateToInput = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

const getCurrentDateInput = (timeZone) => {
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  return dateToInput(new Date());
};

const addCalendarDays = (date, days) => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
};

const getMonthRange = (date, monthOffset = 0) => {
  const first = new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { from: dateToInput(first), to: dateToInput(last) };
};

const getDatePresetRange = (preset, timeZone) => {
  const today = parseDateInput(getCurrentDateInput(timeZone)) || new Date();
  const todayInput = dateToInput(today);
  if (preset === 'today') return { from: todayInput, to: todayInput };
  if (preset === 'yesterday') {
    const yesterday = dateToInput(addCalendarDays(today, -1));
    return { from: yesterday, to: yesterday };
  }
  if (preset === 'last_7_days') return { from: dateToInput(addCalendarDays(today, -6)), to: todayInput };
  if (preset === 'this_month') return { from: dateToInput(new Date(today.getFullYear(), today.getMonth(), 1)), to: todayInput };
  if (preset === 'last_month') return getMonthRange(today, -1);
  return { from: '', to: '' };
};

const getCalendarDays = (monthDate) => {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const calendarStart = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(calendarStart, index));
};

const dateRangesEqual = (left, right) => left?.from === right?.from && left?.to === right?.to;

const formatDateLabel = (date, dateLabelStyle = 'full') => date.toLocaleDateString(
  'en-US',
  dateLabelStyle === 'short'
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { dateStyle: 'full' }
);

export default function PosDateRangePicker({
  from = '',
  to = '',
  onChange = () => {},
  onPreset,
  mobile = false,
  testIdPrefix = 'pos-history-calendar',
  enableRangeDrag = false,
  timeZone,
  dateLabelStyle = 'full'
}) {
  const initialMonth = parseDateInput(from) || parseDateInput(to) || new Date();
  const [monthDate, setMonthDate] = useState(() => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));
  const [customRangeActive, setCustomRangeActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const ignoreClickRef = useRef(false);
  const calendarDays = getCalendarDays(monthDate);
  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);
  const fromKey = dateToInput(fromDate);
  const toKey = dateToInput(toDate);
  const todayKey = getCurrentDateInput(timeZone);
  const hasCompleteRange = Boolean(fromKey && toKey);
  const hasMultiDayRange = hasCompleteRange && fromKey !== toKey;
  const activePreset = CALENDAR_PRESETS.find((preset) => dateRangesEqual(
    { from, to },
    getDatePresetRange(preset.value, timeZone)
  ))?.value;
  const isCustomRange = customRangeActive || (Boolean(fromKey || toKey) && !activePreset);
  const rangeTrackClassName = mobile ? 'before:inset-y-2' : 'before:inset-y-1';

  useEffect(() => {
    if (!enableRangeDrag || !isDragging) return undefined;
    const finishDrag = () => {
      setIsDragging(false);
      window.setTimeout(() => {
        ignoreClickRef.current = false;
      }, 0);
    };
    window.addEventListener('pointerup', finishDrag);
    return () => window.removeEventListener('pointerup', finishDrag);
  }, [enableRangeDrag, isDragging]);

  const selectDate = (date) => {
    const selectedKey = dateToInput(date);
    setCustomRangeActive(true);
    if (date.getMonth() !== monthDate.getMonth() || date.getFullYear() !== monthDate.getFullYear()) {
      setMonthDate(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    if (!fromKey || toKey) {
      onChange(selectedKey, '');
      return;
    }
    if (selectedKey < fromKey) onChange(selectedKey, fromKey);
    else onChange(fromKey, selectedKey);
  };

  const applyPreset = (preset) => {
    const range = getDatePresetRange(preset, timeZone);
    setCustomRangeActive(false);
    onPreset?.(preset);
    if (preset === 'custom') {
      onChange('', '');
      setCustomRangeActive(true);
    } else {
      onChange(range.from, range.to);
    }
    const anchor = parseDateInput(range.from);
    if (anchor) setMonthDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  };

  const startDrag = (event, dateValue) => {
    if (!enableRangeDrag) return;
    event.preventDefault();
    ignoreClickRef.current = true;
    setCustomRangeActive(true);
    onChange(dateValue, dateValue);
    setIsDragging(true);
  };

  const updateDrag = (dateValue) => {
    if (!enableRangeDrag || !isDragging || !fromKey) return;
    if (dateValue < fromKey) onChange(dateValue, fromKey);
    else onChange(fromKey, dateValue);
  };

  return (
    <div className={`grid ${mobile ? 'gap-3' : 'gap-2'}`} data-testid={`${testIdPrefix}-picker`}>
      <div className={`grid grid-cols-2 ${mobile ? 'gap-2.5' : 'gap-1.5'}`} role="group" aria-label="Date presets">
        {CALENDAR_PRESETS.map((preset) => {
          const selected = activePreset === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              data-testid={`${testIdPrefix}-preset-${preset.value}`}
              aria-pressed={selected}
              onClick={() => applyPreset(preset.value)}
              className={`${mobile ? 'h-9 rounded-lg px-2 text-[11px]' : 'h-8 rounded-lg px-2 text-[11px]'} min-w-0 border font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected
                ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
                : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'
                }`}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          data-testid={`${testIdPrefix}-preset-custom`}
          aria-pressed={isCustomRange}
          onClick={() => applyPreset('custom')}
          className={`inline-flex ${mobile ? 'h-9 rounded-lg px-2 text-[11px]' : 'h-8 rounded-lg px-2 text-[11px]'} min-w-0 items-center justify-center gap-1 border font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${isCustomRange
            ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
            : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'
            }`}
        >
          Custom Range
          <CalendarDays className={`${mobile ? 'h-5 w-5' : 'h-3.5 w-3.5'} shrink-0`} aria-hidden="true" />
        </button>
      </div>

      <div className={`${mobile ? 'rounded-xl border-0 bg-transparent px-0 py-1' : 'rounded-lg border border-slate-100 bg-slate-50/40 px-2 py-1.5'}`}>
        <div className={`flex items-center justify-between gap-2 ${mobile ? 'px-0' : 'px-1'}`}>
          <button
            type="button"
            data-testid={`${testIdPrefix}-previous-month`}
            aria-label="Previous month"
            onClick={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            className={`grid ${mobile ? 'h-10 w-10 rounded-xl' : 'h-7 w-7 rounded-lg'} place-items-center text-slate-500 transition hover:bg-white hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className={`${mobile ? 'text-[15px]' : 'text-[12px]'} font-black text-[#0F172A]`} aria-live="polite">
            {monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
          <button
            type="button"
            data-testid={`${testIdPrefix}-next-month`}
            aria-label="Next month"
            onClick={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            className={`grid ${mobile ? 'h-10 w-10 rounded-xl' : 'h-7 w-7 rounded-lg'} place-items-center text-slate-500 transition hover:bg-white hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className={`${mobile ? 'mt-2' : 'mt-1'} grid grid-cols-7 text-center`} role="row" aria-label="Days of the week">
          {CALENDAR_WEEKDAYS.map((weekday) => (
            <span key={weekday} className={`${mobile ? 'py-1 text-[11px]' : 'py-0.5 text-[9px]'} font-bold text-slate-400`}>{weekday}</span>
          ))}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label="Calendar dates">
          {calendarDays.map((date) => {
            const dateKey = dateToInput(date);
            const isOutsideMonth = date.getMonth() !== monthDate.getMonth();
            const isStart = dateKey === fromKey;
            const isEnd = dateKey === toKey;
            const isInRange = hasCompleteRange && dateKey > fromKey && dateKey < toKey;
            const isSelected = isStart || isEnd;
            const isRangeStart = hasMultiDayRange && isStart;
            const isRangeEnd = hasMultiDayRange && isEnd;
            const isRangeSegment = hasMultiDayRange && (isInRange || isRangeStart || isRangeEnd);
            const rangeTrackStartClassName = isRangeStart ? 'before:left-1/2' : 'before:left-0';
            const rangeTrackEndClassName = isRangeEnd ? 'before:right-1/2' : 'before:right-0';
            return (
              <button
                key={dateKey}
                type="button"
                role="gridcell"
                data-testid={`${testIdPrefix}-day-${dateKey}`}
                aria-label={formatDateLabel(date, dateLabelStyle)}
                aria-pressed={isSelected || isInRange}
                onPointerDown={(event) => startDrag(event, dateKey)}
                onPointerEnter={() => updateDrag(dateKey)}
                onPointerUp={() => {
                  if (enableRangeDrag) setIsDragging(false);
                }}
                onClick={() => {
                  if (enableRangeDrag && ignoreClickRef.current) return;
                  selectDate(date);
                }}
                className={`relative z-0 flex ${mobile ? 'h-9 text-[13px]' : 'h-7 text-[11px]'} min-w-0 items-center justify-center rounded-full transition focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${isRangeSegment ? `before:absolute ${rangeTrackClassName} ${rangeTrackStartClassName} ${rangeTrackEndClassName} before:z-0 before:bg-[#C7DCF3]` : ''} ${isRangeStart ? 'before:rounded-l-full' : ''} ${isRangeEnd ? 'before:rounded-r-full' : ''} ${isOutsideMonth ? 'text-slate-300' : 'text-slate-700'} hover:bg-blue-50`}
              >
                <span className={`relative z-10 grid ${mobile ? 'h-7 w-7' : 'h-6 w-6'} place-items-center rounded-full ${isSelected
                  ? 'bg-[#1A4E8D] font-black text-white shadow-sm'
                  : dateKey === todayKey
                    ? 'font-black text-[#1A4E8D] ring-1 ring-[#8AA8CD]'
                    : 'font-semibold'
                  }`}
                >
                  {date.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sr-only" aria-hidden="false">
        <label htmlFor={`${testIdPrefix}-from`}>Date from</label>
        <input
          id={`${testIdPrefix}-from`}
          data-testid={`${testIdPrefix}-from`}
          type="date"
          value={from}
          onChange={(event) => {
            setCustomRangeActive(true);
            onChange(event.target.value, to);
          }}
        />
        <label htmlFor={`${testIdPrefix}-to`}>Date to</label>
        <input
          id={`${testIdPrefix}-to`}
          data-testid={`${testIdPrefix}-to`}
          type="date"
          value={to}
          onChange={(event) => {
            setCustomRangeActive(true);
            onChange(from, event.target.value);
          }}
        />
      </div>
    </div>
  );
}
