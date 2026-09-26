import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export const SALES_DATE_RANGE_PRESETS = Object.freeze([
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' }
]);

const toDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromDateOnly = (value) => {
  if (!DATE_ONLY_PATTERN.test(String(value || ''))) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};

const addDays = (date, amount) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfWeek = (date) => addDays(date, -date.getDay());
const todayDate = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const range = (dateFrom, dateTo) => ({
  dateFrom: toDateOnly(dateFrom),
  dateTo: toDateOnly(dateTo)
});

export const getSalesDateRangePreset = (preset, today = todayDate()) => {
  const current = today instanceof Date ? today : fromDateOnly(today);
  if (!current) return { dateFrom: '', dateTo: '' };

  if (preset === 'yesterday') {
    const yesterday = addDays(current, -1);
    return range(yesterday, yesterday);
  }
  if (preset === 'this_week') return range(startOfWeek(current), current);
  if (preset === 'last_week') {
    const thisWeekStart = startOfWeek(current);
    return range(addDays(thisWeekStart, -7), addDays(thisWeekStart, -1));
  }
  if (preset === 'this_month') return range(startOfMonth(current), current);
  if (preset === 'last_month') {
    const thisMonthStart = startOfMonth(current);
    const lastMonthEnd = addDays(thisMonthStart, -1);
    return range(startOfMonth(lastMonthEnd), lastMonthEnd);
  }
  if (preset === 'last_7_days') return range(addDays(current, -6), current);
  if (preset === 'last_30_days') return range(addDays(current, -29), current);
  return range(current, current);
};

const formatRangeLabel = (dateFrom, dateTo) => {
  const start = fromDateOnly(dateFrom);
  const end = fromDateOnly(dateTo);
  if (!start && !end) return 'Any date';
  if (start && end && dateFrom !== dateTo) return `${SHORT_DATE_FORMATTER.format(start)} – ${SHORT_DATE_FORMATTER.format(end)}`;
  return SHORT_DATE_FORMATTER.format(start || end);
};

const getCalendarDays = (month) => {
  const firstDay = startOfMonth(month);
  const calendarStart = startOfWeek(firstDay);
  return Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));
};

const sameRange = (left, right) => left.dateFrom === right.dateFrom && left.dateTo === right.dateTo;

export default function SalesDateRangePicker({ dateFrom = '', dateTo = '', onApply }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(fromDateOnly(dateFrom) || fromDateOnly(dateTo) || todayDate()));

  const today = todayDate();
  const todayValue = toDateOnly(today);
  const calendarDays = useMemo(() => getCalendarDays(viewMonth), [viewMonth]);
  const presetRanges = Object.fromEntries(
    SALES_DATE_RANGE_PRESETS.map((preset) => [preset.value, getSalesDateRangePreset(preset.value, today)])
  );

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const openPicker = () => {
    const nextFrom = dateFrom || '';
    const nextTo = dateTo || '';
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    setViewMonth(startOfMonth(fromDateOnly(nextFrom) || fromDateOnly(nextTo) || todayDate()));
    setOpen(true);
  };

  const handleDayClick = (day) => {
    const selectedValue = toDateOnly(day);
    if (!draftFrom || draftTo) {
      setDraftFrom(selectedValue);
      setDraftTo('');
    } else if (selectedValue < draftFrom) {
      setDraftFrom(selectedValue);
      setDraftTo(draftFrom);
    } else {
      setDraftTo(selectedValue);
    }
    setViewMonth(startOfMonth(day));
  };

  const handlePresetClick = (preset) => {
    const nextRange = presetRanges[preset.value];
    setDraftFrom(nextRange.dateFrom);
    setDraftTo(nextRange.dateTo);
    setViewMonth(startOfMonth(fromDateOnly(nextRange.dateFrom) || today));
  };

  const handleStartDateChange = (event) => {
    const nextFrom = event.target.value;
    setDraftFrom(nextFrom);
    if (nextFrom && draftTo && nextFrom > draftTo) setDraftTo(nextFrom);
    if (nextFrom) setViewMonth(startOfMonth(fromDateOnly(nextFrom) || today));
  };

  const handleEndDateChange = (event) => {
    const nextTo = event.target.value;
    setDraftTo(nextTo);
    if (nextTo && draftFrom && nextTo < draftFrom) setDraftFrom(nextTo);
    if (nextTo) setViewMonth(startOfMonth(fromDateOnly(nextTo) || today));
  };

  const doneDisabled = Boolean(draftFrom !== draftTo && (!draftFrom || !draftTo));
  const selectedRange = { dateFrom: draftFrom, dateTo: draftTo };
  const triggerLabel = `Sales date range: ${dateFrom || 'any'} to ${dateTo || 'any'}`;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <CalendarDays size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate font-semibold">{formatRangeLabel(dateFrom, dateTo)}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select sales date range"
          className="absolute left-0 top-full z-50 mt-2 w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="grid md:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="min-w-0 p-4 sm:p-5 md:border-r md:border-slate-200">
              <div className="flex items-center justify-between gap-3">
                <button type="button" aria-label="Previous month" onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-200">
                  <ChevronLeft size={19} aria-hidden="true" />
                </button>
                <p className="text-base font-semibold text-slate-900">{MONTH_FORMATTER.format(viewMonth)}</p>
                <button type="button" aria-label="Next month" onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-200">
                  <ChevronRight size={19} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 border-b border-slate-200 pb-2 text-center text-xs font-semibold text-slate-500">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((weekday) => <span key={weekday}>{weekday}</span>)}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-y-1 text-center">
                {calendarDays.map((day) => {
                  const value = toDateOnly(day);
                  const isOutsideMonth = day.getMonth() !== viewMonth.getMonth();
                  const isStart = value === draftFrom;
                  const isEnd = value === draftTo;
                  const isInRange = Boolean(draftFrom && draftTo && value >= draftFrom && value <= draftTo);
                  const isToday = value === todayValue;
                  return (
                    <div key={value} className={`flex h-9 items-center justify-center ${isInRange ? 'bg-lime-100' : ''} ${isStart ? 'rounded-l-full' : ''} ${isEnd ? 'rounded-r-full' : ''}`}>
                      <button
                        type="button"
                        aria-label={value}
                        aria-current={isToday ? 'date' : undefined}
                        aria-pressed={isStart || isEnd}
                        onClick={() => handleDayClick(day)}
                        className={`h-8 w-8 rounded-full text-sm transition focus:outline-none focus:ring-2 focus:ring-teal-200 ${isStart || isEnd ? 'bg-lime-500 font-semibold text-white hover:bg-lime-600' : `${isOutsideMonth ? 'text-slate-300' : 'text-slate-800'} hover:bg-lime-100`} ${isToday && !isStart && !isEnd ? 'font-bold ring-1 ring-slate-300' : ''}`}
                      >
                        {day.getDate()}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-5 border-t border-slate-100 pt-4">
                <label className="min-w-0">
                  <span className="block text-xs font-medium text-slate-500">Start date</span>
                  <input aria-label="Start date" type="date" value={draftFrom} max={draftTo || undefined} onChange={handleStartDateChange} className="mt-1 h-8 w-full min-w-0 border-0 border-b border-slate-300 bg-transparent px-0 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-0" />
                </label>
                <label className="min-w-0">
                  <span className="block text-xs font-medium text-slate-500">End date</span>
                  <input aria-label="End date" type="date" value={draftTo} min={draftFrom || undefined} onChange={handleEndDateChange} className="mt-1 h-8 w-full min-w-0 border-0 border-b border-slate-300 bg-transparent px-0 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-0" />
                </label>
              </div>
            </div>

            <div className="border-t border-slate-200 p-3 md:border-t-0">
              <p className="sr-only">Date range presets</p>
              <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-1">
                {SALES_DATE_RANGE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    aria-pressed={sameRange(selectedRange, presetRanges[preset.value])}
                    onClick={() => handlePresetClick(preset)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-teal-200 ${sameRange(selectedRange, presetRanges[preset.value]) ? 'bg-lime-100 font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-200">
              Cancel
            </button>
            <button type="button" disabled={doneDisabled} onClick={() => { onApply({ dateFrom: draftFrom, dateTo: draftTo }); setOpen(false); }} className="rounded-lg px-3 py-2 text-sm font-semibold uppercase tracking-wide text-emerald-600 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
