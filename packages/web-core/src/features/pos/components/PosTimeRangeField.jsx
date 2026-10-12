import { useEffect, useRef, useState } from 'react';
import { Clock3, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PosFilterDialogFooter, PosFilterDialogHeader } from './PosFilterDialogParts.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import { usePosViewportMode } from './PosResponsiveFormDrawer.jsx';

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const PERIOD_OPTIONS = ['AM', 'PM'];
const DEFAULT_TIME_PARTS = {
  start: { hour12: 9, minute: 0, period: 'AM' },
  end: { hour12: 6, minute: 0, period: 'PM' }
};
const TIME_WHEEL_ITEM_HEIGHT = 48;

const parseTimeInput = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23 || !Number.isInteger(minute) || minute > 59) return null;
  return {
    hour24,
    hour12: hour24 % 12 || 12,
    minute,
    period: hour24 >= 12 ? 'PM' : 'AM'
  };
};

const formatTimeInput = ({ hour12, minute, period }) => {
  const hour24 = period === 'PM'
    ? (hour12 === 12 ? 12 : hour12 + 12)
    : (hour12 === 12 ? 0 : hour12);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const normalizeTimeValue = (value) => {
  const parsed = parseTimeInput(value);
  return parsed ? formatTimeInput(parsed) : '';
};

const formatTimeDisplay = (value, placeholder) => {
  const parsed = parseTimeInput(value);
  return parsed ? `${parsed.hour12}:${String(parsed.minute).padStart(2, '0')} ${parsed.period}` : placeholder;
};

function TimeWheelColumn({ label, options, selectedValue, previewValue, formatOption, onSelect, testIdPrefix }) {
  const listRef = useRef(null);
  const lastReportedValueRef = useRef(selectedValue);
  const suppressScrollSelectionRef = useRef(false);
  const expectedScrollTopRef = useRef(null);
  const centeredValue = selectedValue ?? previewValue;
  const centeredIndex = Math.max(0, options.findIndex((option) => String(option) === String(centeredValue ?? '')));

  const clearProgrammaticScroll = () => {
    suppressScrollSelectionRef.current = false;
    expectedScrollTopRef.current = null;
  };

  const moveSelection = (direction) => {
    if (!options.length) return;
    const currentIndex = options.findIndex((option) => String(option) === String(centeredValue ?? ''));
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.min(options.length - 1, Math.max(0, baseIndex + direction));
    if (nextIndex !== currentIndex || selectedValue == null) {
      clearProgrammaticScroll();
      onSelect(options[nextIndex]);
    }
  };

  const handleWheel = (event) => {
    if (!event.deltaY) return;
    event.preventDefault();
    moveSelection(event.deltaY > 0 ? 1 : -1);
  };

  const handleScroll = (event) => {
    if (!options.length) return;
    const scrollTop = Number(event.currentTarget.scrollTop) || 0;
    if (suppressScrollSelectionRef.current) {
      const expectedScrollTop = expectedScrollTopRef.current;
      if (expectedScrollTop == null || Math.abs(scrollTop - expectedScrollTop) <= 1) {
        clearProgrammaticScroll();
      }
      return;
    }
    const nextIndex = Math.min(
      options.length - 1,
      Math.max(0, Math.round(scrollTop / TIME_WHEEL_ITEM_HEIGHT))
    );
    const nextValue = options[nextIndex];
    if (String(nextValue) === String(lastReportedValueRef.current ?? '')) return;
    lastReportedValueRef.current = nextValue;
    onSelect(nextValue);
  };

  const handleKeyDown = (event) => {
    if (!options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      clearProgrammaticScroll();
      onSelect(options[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      clearProgrammaticScroll();
      onSelect(options[options.length - 1]);
    }
  };

  useEffect(() => {
    lastReportedValueRef.current = selectedValue;
  }, [selectedValue]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !options.length) return;
    const targetTop = centeredIndex * TIME_WHEEL_ITEM_HEIGHT;
    if (Math.abs((Number(list.scrollTop) || 0) - targetTop) <= 1) {
      clearProgrammaticScroll();
      return;
    }
    suppressScrollSelectionRef.current = true;
    expectedScrollTopRef.current = targetTop;
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ top: targetTop, behavior: 'smooth' });
    } else {
      list.scrollTop = targetTop;
    }
  }, [centeredIndex, options.length]);

  return (
    <div className="min-w-0" aria-label={label}>
      <div className="relative overflow-hidden bg-white px-0">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-12 -translate-y-1/2 rounded-xl border border-[#A9C5EA] bg-white shadow-sm" />
        <div
          ref={listRef}
          className="relative z-20 h-36 snap-y snap-mandatory overscroll-contain overflow-y-auto scroll-smooth py-12 select-none touch-pan-y [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="listbox"
          aria-label={`${label} options`}
          onPointerDown={clearProgrammaticScroll}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onWheel={handleWheel}
        >
          {options.map((option) => {
            const optionValue = String(option);
            const selected = String(selectedValue ?? '') === optionValue;
            const preview = selectedValue == null && String(previewValue ?? '') === optionValue;
            return (
              <button
                key={optionValue}
                type="button"
                role="option"
                aria-selected={selected}
                data-testid={`${testIdPrefix}-${optionValue}`}
                onClick={() => {
                  clearProgrammaticScroll();
                  onSelect(option);
                }}
                className={`flex h-12 w-full snap-center items-center justify-center rounded-xl text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${selected
                  ? 'font-black text-[#0F172A]'
                  : preview
                    ? 'font-semibold text-slate-400'
                    : 'font-semibold text-slate-300 hover:text-slate-500'
                  }`}
              >
                {formatOption(option)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimeSelectionCard({ id, label, value, placeholder, active, onClick }) {
  return (
    <button
      type="button"
      data-testid={id}
      aria-pressed={active}
      onClick={onClick}
      className={`min-w-0 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${active
        ? 'border-[#1A4E8D] bg-blue-50/70 shadow-sm shadow-blue-900/10'
        : 'border-slate-200 bg-slate-50/60 hover:border-[#8AA8CD] hover:bg-white'
        }`}
    >
      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`mt-0.5 block truncate text-xs font-semibold ${value ? 'text-slate-800' : 'text-slate-400 opacity-70'}`}>
        {formatTimeDisplay(value, placeholder)}
      </span>
    </button>
  );
}

export default function PosTimeRangeField({
  id = 'pos-time-range-field',
  start = '',
  end = '',
  onChange = () => {},
  title = 'Select daily time window',
  description = 'Choose when this voucher can be redeemed each day.',
  openLabel = 'Open daily time window',
  startPlaceholder = 'e.g. 09:00 AM',
  endPlaceholder = 'e.g. 06:00 PM',
  compact = false,
  layerClassName = 'z-[10000]'
}) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [activePart, setActivePart] = useState('start');
  const viewportMode = usePosViewportMode();
  const isMobileDialog = viewportMode === 'mobile';
  const dialogId = `${id}-dialog`;
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const startSelected = Boolean(parseTimeInput(start));
  const endSelected = Boolean(parseTimeInput(end));

  const openDialog = () => {
    setDraftStart(start || '');
    setDraftEnd(end || '');
    setActivePart('start');
    setOpen(true);
  };

  const setDraftPart = (part, nextValue) => {
    if (part === 'start') setDraftStart(nextValue);
    else setDraftEnd(nextValue);
  };

  const updateTimePart = (part, key, value) => {
    const currentValue = part === 'start' ? draftStart : draftEnd;
    const current = parseTimeInput(currentValue) || DEFAULT_TIME_PARTS[part];
    const next = {
      ...current,
      [key]: key === 'minute' || key === 'hour12' ? Number(value) : value
    };
    setDraftPart(part, formatTimeInput(next));
  };

  const activeValue = activePart === 'start' ? draftStart : draftEnd;
  const activeTime = parseTimeInput(activeValue);
  const normalizedStart = normalizeTimeValue(draftStart);
  const normalizedEnd = normalizeTimeValue(draftEnd);
  const hasNoTimes = !normalizedStart && !normalizedEnd;
  const hasCompleteTimes = Boolean(normalizedStart && normalizedEnd);
  const hasEqualTimes = hasCompleteTimes && normalizedStart === normalizedEnd;
  const canApply = hasNoTimes || (hasCompleteTimes && !hasEqualTimes);

  const applyRange = () => {
    if (!canApply) return;
    onChange(normalizedStart, normalizedEnd);
    setOpen(false);
  };

  return (
    <>
      <div className="w-full min-w-0">
        <button
          id={id}
          type="button"
          aria-label={openLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={dialogId}
          onClick={openDialog}
          className={`${compact ? 'h-8 min-h-8 px-2.5 text-xs' : 'min-h-10 px-3 text-sm'} group flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white font-semibold outline-none transition hover:border-[#8AA8CD] hover:bg-slate-50 focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20`}
        >
          <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center overflow-hidden text-left">
            <span className="min-w-0 truncate pr-2 text-slate-800">
              <span className="mr-1 text-[11px] font-semibold text-slate-500">Start:</span>
              <span className={startSelected ? 'font-semibold text-slate-800' : 'font-normal text-slate-400 opacity-70'}>
                {formatTimeDisplay(start, startPlaceholder)}
              </span>
            </span>
            <span role="separator" aria-orientation="vertical" data-testid={`${id}-range-divider`} className="h-5 w-px bg-slate-200" />
            <span className="min-w-0 truncate pl-2 text-slate-800">
              <span className="mr-1 text-[11px] font-semibold text-slate-500">End:</span>
              <span className={endSelected ? 'font-semibold text-slate-800' : 'font-normal text-slate-400 opacity-70'}>
                {formatTimeDisplay(end, endPlaceholder)}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center border-l border-slate-200 pl-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-50 text-slate-600 transition group-hover:bg-blue-50 group-hover:text-[#1A4E8D]">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
            </span>
          </span>
        </button>
      </div>

      <PosFilterDialogShell
        open={open}
        onClose={() => setOpen(false)}
        mode="calendar"
        mobile={isMobileDialog}
        id={dialogId}
        ariaLabelledBy={titleId}
        ariaDescribedBy={descriptionId}
        layerClassName={layerClassName}
        overlayClassName="bg-slate-950/60 backdrop-blur-sm"
        className="h-auto max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[36rem]"
      >
        <PosFilterDialogHeader
          title={title}
          description={description}
          titleId={titleId}
          descriptionId={descriptionId}
          closeLabel="Close daily time window picker"
          mobile={isMobileDialog}
          headerAction={(
            <Button
              type="button"
              onClick={() => {
                setDraftStart('');
                setDraftEnd('');
                setActivePart('start');
              }}
              aria-label="Reset daily time window"
              title="Reset times"
              className={`${isMobileDialog ? 'h-11 w-11 rounded-lg' : 'h-9 w-9 rounded-lg'} shrink-0 bg-[#1A4E8D] p-0 text-white shadow-sm shadow-blue-900/15 hover:bg-[#143F73]`}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          titleClassName="text-xl font-black text-[#0F172A]"
          descriptionClassName="mt-0.5 text-[12px] text-slate-500"
          className={`${isMobileDialog ? 'px-4 py-3' : 'px-4 py-2.5'} dgfy-pos-history-dialog-header`}
        />

        <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${isMobileDialog ? 'px-4 py-3' : 'px-4 py-2'} dgfy-pos-history-dialog-body`}>
          <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="Daily time selections">
            <TimeSelectionCard
              id={`${id}-start-selection`}
              label="Start time"
              value={draftStart}
              placeholder={startPlaceholder}
              active={activePart === 'start'}
              onClick={() => setActivePart('start')}
            />
            <TimeSelectionCard
              id={`${id}-end-selection`}
              label="End time"
              value={draftEnd}
              placeholder={endPlaceholder}
              active={activePart === 'end'}
              onClick={() => setActivePart('end')}
            />
          </div>

          <div
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
            data-testid={`${id}-time-picker`}
          >
            <TimeWheelColumn
              label="Hour"
              options={HOUR_OPTIONS}
              selectedValue={activeTime?.hour12}
              previewValue={(activeTime || DEFAULT_TIME_PARTS[activePart]).hour12}
              formatOption={(option) => String(option)}
              onSelect={(value) => updateTimePart(activePart, 'hour12', value)}
              testIdPrefix={`${id}-${activePart}-hour`}
            />
            <span className="self-center text-center text-lg font-semibold text-slate-400" aria-hidden="true">:</span>
            <TimeWheelColumn
              label="Minute"
              options={MINUTE_OPTIONS}
              selectedValue={activeTime?.minute}
              previewValue={(activeTime || DEFAULT_TIME_PARTS[activePart]).minute}
              formatOption={(option) => String(option).padStart(2, '0')}
              onSelect={(value) => updateTimePart(activePart, 'minute', value)}
              testIdPrefix={`${id}-${activePart}-minute`}
            />
            <TimeWheelColumn
              label="Period"
              options={PERIOD_OPTIONS}
              selectedValue={activeTime?.period}
              previewValue={(activeTime || DEFAULT_TIME_PARTS[activePart]).period}
              formatOption={(option) => option}
              onSelect={(value) => updateTimePart(activePart, 'period', value)}
              testIdPrefix={`${id}-${activePart}-period`}
            />
          </div>

          {hasEqualTimes ? (
            <p className="mt-1 text-center text-[11px] font-medium text-rose-700" role="alert">
              Start and end times must be different.
            </p>
          ) : null}
        </div>

        <PosFilterDialogFooter
          onCancel={() => setOpen(false)}
          onApply={applyRange}
          applyIcon={Clock3}
          applyLabel="Apply Times"
          cancelLabel="Cancel"
          mobile={isMobileDialog}
          buttonStyle="form"
          className={`${isMobileDialog ? 'gap-3 px-4 py-3' : 'gap-2 px-4 py-2'} dgfy-pos-history-dialog-footer`}
          leftButtonClassName="border-[#A9C5EA] px-3 text-[11px] font-extrabold text-[#1A4E8D] hover:bg-[#F5F9FF]"
          applyButtonClassName="text-[13px]"
          disabled={!canApply}
        />
      </PosFilterDialogShell>
    </>
  );
}
