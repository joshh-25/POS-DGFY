import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import usePosReportsPopoverPosition from './usePosReportsPopoverPosition.js';

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' }
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dateToInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const inputToDate = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, 1);
const compareDates = (left, right) => left.localeCompare(right);

const formatMonth = (date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const formatDateLabel = (value) => inputToDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const getPresetRange = (preset) => {
  const today = startOfDay(new Date());
  if (preset === 'yesterday') {
    const yesterday = dateToInput(addDays(today, -1));
    return { dateFrom: yesterday, dateTo: yesterday };
  }
  if (preset === 'last_7_days') return { dateFrom: dateToInput(addDays(today, -6)), dateTo: dateToInput(today) };
  if (preset === 'this_month') return { dateFrom: dateToInput(startOfMonth(today)), dateTo: dateToInput(today) };
  if (preset === 'last_month') {
    const previousMonth = addMonths(today, -1);
    return {
      dateFrom: dateToInput(previousMonth),
      dateTo: dateToInput(new Date(today.getFullYear(), today.getMonth(), 0))
    };
  }
  const todayValue = dateToInput(today);
  return { dateFrom: todayValue, dateTo: todayValue };
};

const optionButtonClass = (selected) => [
  'inline-flex min-h-9 min-w-[8rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 py-1 text-center text-[11px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/35 focus-visible:ring-offset-1',
  selected
    ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm'
    : 'border-[#A9C5EA] bg-white text-[#1A4E8D] hover:border-[#1A4E8D] hover:bg-[#F5F9FF]'
].join(' ');

const getCalendarCells = (month) => {
  const firstDay = startOfMonth(month);
  const firstCell = addDays(firstDay, -firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(firstCell, index));
};

export default function PosReportsDateFilterPanel({
  open = false,
  onClose,
  onApplyDateRange,
  dateRange = {},
  anchorRef
}) {
  const initialFrom = dateRange.dateFrom || dateToInput(new Date());
  const initialTo = dateRange.dateTo || initialFrom;
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);
  const [activePreset, setActivePreset] = useState('custom');
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(inputToDate(initialFrom)));
  const [isDragging, setIsDragging] = useState(false);
  const ignoreClickRef = useRef(false);
  const panelRef = useRef(null);
  const position = usePosReportsPopoverPosition({ open, anchorRef, maxWidth: 416 });

  useEffect(() => {
    if (!open) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    const finishDrag = () => setIsDragging(false);

    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('pointerup', finishDrag);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('pointerup', finishDrag);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) onClose?.();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [onClose, open]);

  const calendarCells = useMemo(() => getCalendarCells(viewMonth), [viewMonth]);
  const rangeStart = draftFrom && draftTo && compareDates(draftFrom, draftTo) <= 0 ? draftFrom : draftTo;
  const rangeEnd = draftFrom && draftTo && compareDates(draftFrom, draftTo) <= 0 ? draftTo : draftFrom;

  const updateRange = (dateFrom, dateTo, preset = 'custom') => {
    setDraftFrom(dateFrom);
    setDraftTo(dateTo);
    setActivePreset(preset);
    setViewMonth(startOfMonth(inputToDate(dateFrom)));
  };

  const applyPreset = (preset) => {
    if (preset === 'custom') {
      setActivePreset('custom');
      return;
    }
    const nextRange = getPresetRange(preset);
    updateRange(nextRange.dateFrom, nextRange.dateTo, preset);
  };

  const resetDateRange = () => {
    const today = getPresetRange('today');
    updateRange(today.dateFrom, today.dateTo, 'today');
  };

  const selectDate = (dateValue) => {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(dateValue);
      setDraftTo('');
    } else if (compareDates(dateValue, draftFrom) < 0) {
      setDraftFrom(dateValue);
      setDraftTo(draftFrom);
    } else {
      setDraftTo(dateValue);
    }
    setActivePreset('custom');
  };

  const startDrag = (event, dateValue) => {
    event.preventDefault();
    ignoreClickRef.current = true;
    setDraftFrom(dateValue);
    setDraftTo(dateValue);
    setActivePreset('custom');
    setIsDragging(true);
  };

  const updateDrag = (dateValue) => {
    if (!isDragging || !draftFrom) return;
    if (compareDates(dateValue, draftFrom) < 0) {
      setDraftFrom(dateValue);
      setDraftTo(draftFrom);
    } else {
      setDraftTo(dateValue);
    }
  };

  const finishDrag = () => {
    setIsDragging(false);
    window.setTimeout(() => {
      ignoreClickRef.current = false;
    }, 0);
  };

  const applyDateRange = () => {
    if (!rangeStart || !rangeEnd) return;
    onApplyDateRange?.({ dateFrom: rangeStart, dateTo: rangeEnd });
  };

  if (!open) return null;

  return (
      <div
        ref={panelRef}
        id="pos-reports-date-dialog"
        role="dialog"
        aria-modal="false"
        aria-labelledby="pos-reports-date-title"
        aria-describedby="pos-reports-date-description"
        style={{
          top: position?.top ?? 80,
          left: position?.left ?? 12,
          width: position?.width ?? 'calc(100vw - 24px)',
          maxHeight: position ? position.maxHeight : 'calc(100dvh - 92px)'
        }}
        className="fixed z-[80] flex max-h-[calc(100dvh-92px)] max-w-[26rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 lg:max-h-none lg:overflow-visible"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-3 py-2.5 sm:px-4 lg:px-3 lg:py-2">
          <div className="min-w-0">
            <h2 id="pos-reports-date-title" className="text-[17px] font-black text-slate-950">Select Date</h2>
            <p id="pos-reports-date-description" className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">Choose a date range for the transaction history.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" onClick={resetDateRange} aria-label="Reset date range" className="h-8 w-8 rounded-lg bg-[#1A4E8D] p-0 text-white hover:bg-[#143F73]">
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} aria-label="Close date filter" className="h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-950">
              <X aria-hidden="true" className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 lg:px-3 lg:py-2.5">
          <div className="space-y-2.5">
            <div role="group" aria-label="Date presets" className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x [scrollbar-width:thin]">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={activePreset === preset.value}
                  onClick={() => applyPreset(preset.value)}
                  className={optionButtonClass(activePreset === preset.value)}
                >
                  {activePreset === preset.value ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                  <span>{preset.label}</span>
                  {preset.value === 'custom' ? <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 sm:p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Button type="button" variant="ghost" onClick={() => setViewMonth((current) => addMonths(current, -1))} aria-label="Previous month" className="h-8 w-8 rounded-lg p-0 text-slate-500 hover:bg-white hover:text-[#1A4E8D]">
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </Button>
                <p className="text-[13px] font-black text-slate-700" aria-live="polite">{formatMonth(viewMonth)}</p>
                <Button type="button" variant="ghost" onClick={() => setViewMonth((current) => addMonths(current, 1))} aria-label="Next month" className="h-8 w-8 rounded-lg p-0 text-slate-500 hover:bg-white hover:text-[#1A4E8D]">
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label={`${formatMonth(viewMonth)} calendar`}>
                {WEEKDAY_LABELS.map((weekday) => <span key={weekday} role="columnheader" className="py-0.5 text-center text-[10px] font-black text-slate-400">{weekday}</span>)}
                {calendarCells.map((date) => {
                  const dateValue = dateToInput(date);
                  const inCurrentMonth = date.getMonth() === viewMonth.getMonth();
                  const isSelected = dateValue === draftFrom || dateValue === draftTo;
                  const isInRange = Boolean(rangeStart && rangeEnd && dateValue >= rangeStart && dateValue <= rangeEnd);
                  const isToday = dateValue === dateToInput(startOfDay(new Date()));
                  return (
                    <button
                      key={dateValue}
                      type="button"
                      role="gridcell"
                      aria-label={formatDateLabel(dateValue)}
                      aria-pressed={isSelected}
                      onPointerDown={(event) => startDrag(event, dateValue)}
                      onPointerEnter={() => updateDrag(dateValue)}
                      onPointerUp={finishDrag}
                      onClick={() => {
                        if (ignoreClickRef.current) return;
                        selectDate(dateValue);
                      }}
                      className={`relative flex min-h-8 items-center justify-center rounded-full text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/35 focus-visible:ring-offset-1 ${isSelected
                        ? 'z-10 bg-[#1A4E8D] text-white shadow-sm'
                        : isInRange
                          ? 'rounded-none bg-blue-100 text-[#1A4E8D]'
                          : inCurrentMonth
                            ? 'text-slate-600 hover:bg-white hover:text-[#1A4E8D]'
                            : 'text-slate-300 hover:bg-white/70'}`}
                    >
                      {date.getDate()}
                      {isToday && !isSelected ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#1A4E8D]" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-center text-[12px] font-semibold text-slate-500" aria-live="polite">
              {rangeStart && rangeEnd ? `${formatDateLabel(rangeStart)} – ${formatDateLabel(rangeEnd)}` : 'Select an end date to complete the range.'}
            </p>
          </div>
        </div>

        <footer className="grid shrink-0 gap-1.5 border-t border-slate-200 bg-white px-3 py-2.5 sm:grid-cols-2 sm:px-4 lg:px-3 lg:py-2">
          <Button type="button" variant="outline" onClick={onClose} className="min-h-9 rounded-lg border-[#A9C5EA] px-3 text-[11px] font-extrabold text-[#1A4E8D] hover:bg-[#F5F9FF]">
            Cancel
          </Button>
          <Button type="button" onClick={applyDateRange} disabled={!rangeStart || !rangeEnd} className="min-h-9 rounded-lg bg-[#1A4E8D] px-3 text-[11px] font-extrabold text-white hover:bg-[#143F73]">
            <CalendarDays aria-hidden="true" className="mr-2 h-4 w-4" />
            Apply Filters
          </Button>
        </footer>
      </div>
  );
}
