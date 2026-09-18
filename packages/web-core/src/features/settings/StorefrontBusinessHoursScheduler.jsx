import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  STOREFRONT_BUSINESS_DAY_OPTIONS,
  applyStorefrontBusinessHoursRange,
  createDefaultStorefrontBusinessHours,
  isStorefrontBusinessHoursAlwaysOpen,
  normalizeStorefrontBusinessHours,
  setStorefrontBusinessHoursOpenAllDay
} from './storefrontBusinessHours.js';

const ALL_DAY_KEYS = STOREFRONT_BUSINESS_DAY_OPTIONS.map((day) => day.key);

const toggleArrayValue = (values, value, checked) => {
  const set = new Set(Array.isArray(values) ? values : []);
  if (checked) set.add(value);
  else set.delete(value);
  return Array.from(set);
};

const formatTimeLabel = (value) => {
  const [hourRaw, minuteRaw] = String(value || '').split(':');
  const hour24 = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isInteger(hour24) || !Number.isInteger(minute)) return value;
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${meridiem}`;
};

const buildScheduleSets = (hours) => {
  const groups = new Map();
  STOREFRONT_BUSINESS_DAY_OPTIONS.forEach((day) => {
    const entry = hours.weekly?.[day.key];
    if (!entry?.enabled) return;
    const signature = `${entry.open}-${entry.close}`;
    if (!groups.has(signature)) {
      groups.set(signature, {
        key: signature,
        open: entry.open,
        close: entry.close,
        dayKeys: []
      });
    }
    groups.get(signature).dayKeys.push(day.key);
  });

  return Array.from(groups.values()).sort((left, right) => {
    const leftIndex = ALL_DAY_KEYS.indexOf(left.dayKeys[0]);
    const rightIndex = ALL_DAY_KEYS.indexOf(right.dayKeys[0]);
    return leftIndex - rightIndex;
  });
};

const FULL_DAY_LABELS = Object.freeze({
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday'
});

const formatScheduleDayLabel = (dayKeys) => {
  const orderedKeys = ALL_DAY_KEYS.filter((dayKey) => dayKeys.includes(dayKey));
  if (orderedKeys.length === ALL_DAY_KEYS.length) return 'Every day';
  if (orderedKeys.length === 0) return 'No days selected';

  const indexes = orderedKeys.map((dayKey) => ALL_DAY_KEYS.indexOf(dayKey));
  const isContiguous = indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1);
  if (isContiguous && orderedKeys.length > 1) {
    return `${FULL_DAY_LABELS[orderedKeys[0]]} - ${FULL_DAY_LABELS[orderedKeys[orderedKeys.length - 1]]}`;
  }
  return orderedKeys.map((dayKey) => FULL_DAY_LABELS[dayKey]).join(', ');
};

const formatScheduleTimeLabel = ({ open, close }) => {
  const timeLabel = `${formatTimeLabel(open)} - ${formatTimeLabel(close)}`;
  return open === '00:00' && close === '00:00' ? `${timeLabel} (24 hrs)` : timeLabel;
};

const areDaySelectionsEqual = (left, right) => ALL_DAY_KEYS.every((dayKey) => (
  (Array.isArray(left) ? left : []).includes(dayKey) === (Array.isArray(right) ? right : []).includes(dayKey)
));

const getScheduleConflicts = (scheduleSets, selectedDays, editingSetKey) => scheduleSets
  .filter((set) => set.key !== editingSetKey)
  .map((set) => ({
    ...set,
    overlappingDayKeys: set.dayKeys.filter((dayKey) => selectedDays.includes(dayKey))
  }))
  .filter((set) => set.overlappingDayKeys.length > 0);

const createComposerSnapshot = (open, close, dayKeys) => ({
  open,
  close,
  dayKeys: Array.isArray(dayKeys) ? [...dayKeys] : []
});

function TimeField({
  label,
  value,
  disabled,
  onChange,
  inputRef,
  autoFocus = false
}) {
  return (
    <label className="block min-w-0 max-w-full">
      <span className="mb-1 block text-[12px] font-semibold text-slate-600 sm:mb-1.5">{label}</span>
      <div className="relative min-w-0 max-w-full">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 sm:left-2.5 sm:h-6 sm:w-6"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          type="time"
          className="h-11 w-full min-w-0 max-w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-[13px] font-medium text-slate-900 shadow-sm outline-none transition focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:h-10 sm:rounded-lg sm:pl-10 sm:pr-3"
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
    </label>
  );
}

function DayChip({
  label,
  accessibleLabel = label,
  checked,
  disabled,
  onMouseDown,
  onMouseEnter,
  onClick,
  variant = 'default',
  className = ''
}) {
  const checkedClasses = variant === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-[#1A4E8D] bg-[#1A4E8D] text-white sm:shadow-[0_12px_24px_rgba(26,78,141,0.24)]';

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      aria-pressed={checked}
      disabled={disabled}
      className={`inline-flex min-h-11 select-none items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] font-semibold transition sm:min-h-9 sm:gap-1.5 sm:rounded-lg sm:px-2.5 sm:py-1.5 ${checked ? checkedClasses : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-[#1A4E8D]'} ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${className}`}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {checked && variant !== 'success' ? (
        <svg viewBox="0 0 20 20" className="hidden h-3.5 w-3.5 sm:block" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 10.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {label}
    </button>
  );
}

function ScheduleSetConflictPanel({ conflict, disabled, keepEditingRef, onKeepEditing, onConfirm }) {
  if (!conflict) return null;

  const isAllDays = conflict.allDays === true;
  const title = isAllDays ? 'Apply this time to all days?' : 'Replace existing schedule?';
  const description = isAllDays
    ? 'This will replace the existing time sets for the selected days.'
    : 'Some selected days already have business hours. Replacing them will update the Business Hours draft.';

  return (
    <section
      role="alertdialog"
      aria-labelledby="storefront-business-hours-schedule-set-conflict-title"
      aria-describedby="storefront-business-hours-schedule-set-conflict-description"
      aria-live="assertive"
      className="border-t border-amber-200 bg-amber-50/80 px-5 py-4 sm:px-6"
    >
      <h3 id="storefront-business-hours-schedule-set-conflict-title" className="text-[13px] font-extrabold text-amber-950 sm:text-[14px]">
        {title}
      </h3>
      <p id="storefront-business-hours-schedule-set-conflict-description" className="mt-1 text-[11px] leading-5 text-amber-900 sm:text-[12px]">
        {description}
      </p>
      <ul className="mt-2 space-y-1 text-[11px] leading-5 text-amber-950 sm:text-[12px]">
        {conflict.conflicts.map((set) => (
          <li key={`schedule-conflict-${set.key}`}>
            <span className="font-bold">{formatScheduleDayLabel(set.overlappingDayKeys)}</span>
            {' '}currently uses {formatScheduleTimeLabel(set)}.
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          ref={keepEditingRef}
          type="button"
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-[12px] font-bold text-amber-950 transition hover:bg-amber-100 sm:flex-none"
          disabled={disabled}
          onClick={onKeepEditing}
        >
          Keep editing
        </button>
        <button
          type="button"
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-amber-700 px-3 py-2 text-[12px] font-extrabold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          disabled={disabled}
          onClick={onConfirm}
        >
          {isAllDays ? 'Apply to All Days' : 'Replace schedule'}
        </button>
      </div>
    </section>
  );
}

function ScheduleForm({
  mode,
  alwaysOpen,
  openTime,
  closeTime,
  selectedDays,
  disabled,
  onAlwaysOpenChange,
  onOpenTimeChange,
  onCloseTimeChange,
  onDayChange,
  onCancel,
  onSubmit
}) {
  const allDaysSelected = selectedDays.length === ALL_DAY_KEYS.length;
  const hasDays = alwaysOpen || selectedDays.length > 0;
  const title = mode === 'edit' ? 'Edit Schedule Set' : 'Add New Schedule Set';

  return (
    <form className="border-t border-blue-100 bg-blue-50/30 p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="mb-3 flex items-start gap-2.5 border-b border-blue-100 pb-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600" aria-hidden="true">{mode === 'add' ? '+' : '✎'}</span>
        <div><h5 className="text-[13px] font-extrabold text-slate-950">{title}</h5><p className="mt-0.5 text-[11px] text-slate-500">{mode === 'add' ? 'Choose the hours and days for this schedule.' : 'Update the hours and days for this schedule.'}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-blue-100 pb-3">
        <label className="inline-flex items-center gap-2 text-[12px] font-bold text-slate-900">
          <span>Open 24/7</span>
          <Switch checked={alwaysOpen} disabled={disabled} onCheckedChange={onAlwaysOpenChange} aria-label="Open 24/7 for this schedule" className={alwaysOpen ? 'bg-[#1A4E8D]' : 'bg-slate-200'} />
        </label>
      </div>
      <div className="mt-3 grid gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.5fr)_auto] min-[1200px]:items-end">
        {!alwaysOpen ? <TimeField label="Open Time" value={openTime} disabled={disabled} onChange={(event) => onOpenTimeChange(event.target.value)} /> : <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-semibold text-[#1A4E8D]">Open all day</div>}
        {!alwaysOpen ? <TimeField label="Close Time" value={closeTime} disabled={disabled} onChange={(event) => onCloseTimeChange(event.target.value)} /> : <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-semibold text-[#1A4E8D]">Every day</div>}
        <div className="min-w-0 border-l-0 min-[1200px]:border-l min-[1200px]:border-blue-100 min-[1200px]:pl-4">
          <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[12px] font-bold text-slate-700">Applies to</span><button type="button" className="text-[11px] font-bold text-[#1A4E8D] disabled:opacity-50" disabled={disabled || alwaysOpen} onClick={() => onDayChange(allDaysSelected ? [] : ALL_DAY_KEYS)}>{allDaysSelected ? 'Clear all' : 'All days'}</button></div>
          <div className="flex flex-wrap gap-1.5">
            {STOREFRONT_BUSINESS_DAY_OPTIONS.slice(1).concat(STOREFRONT_BUSINESS_DAY_OPTIONS.slice(0, 1)).map((day) => <DayChip key={day.key} label={day.label} accessibleLabel={`Select ${day.label}`} checked={alwaysOpen || selectedDays.includes(day.key)} disabled={disabled || alwaysOpen} onClick={() => onDayChange(toggleArrayValue(selectedDays, day.key, !selectedDays.includes(day.key)))} />)}
          </div>
          {!hasDays ? <p role="alert" className="mt-1 text-[11px] font-semibold text-amber-700">Select at least one day to continue.</p> : null}
        </div>
        <div className="flex gap-2 min-[1200px]:justify-end"><button type="button" className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 text-[12px] font-bold text-slate-700 sm:min-h-10" disabled={disabled} onClick={onCancel}>Cancel</button><button type="submit" className="min-h-11 rounded-lg bg-[#1A4E8D] px-4 text-[12px] font-extrabold text-white disabled:opacity-60 sm:min-h-10" disabled={disabled || !hasDays}>{mode === 'edit' ? 'Save Changes' : 'Add Schedule Set'}</button></div>
      </div>
    </form>
  );
}

export default function StorefrontBusinessHoursScheduler({
  value,
  onChange,
  disabled = false,
  className = '',
  showHeader = true,
  headerContent = null,
  hideScheduleSummaryHeader = false,
  initialComposerOpen = false,
  draftNotice = '',
  onComposerClose,
  onScheduleCommit
}) {
  const hours = useMemo(() => normalizeStorefrontBusinessHours(value), [value]);
  const scheduleSets = useMemo(() => buildScheduleSets(hours), [hours]);
  const [openTime, setOpenTime] = useState('10:00');
  const [closeTime, setCloseTime] = useState('21:00');
  const [selectedDays, setSelectedDays] = useState(['mon', 'wed', 'fri']);
  const [formAlwaysOpen, setFormAlwaysOpen] = useState(false);
  const [dragState, setDragState] = useState(null);
  const [composerOpen, setComposerOpen] = useState(initialComposerOpen);
  const [editingSetKey, setEditingSetKey] = useState(null);
  const [composerSnapshot, setComposerSnapshot] = useState(() => (
    initialComposerOpen ? createComposerSnapshot('10:00', '21:00', ['mon', 'wed', 'fri']) : null
  ));
  const [pendingConflict, setPendingConflict] = useState(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [deleteConfirmSet, setDeleteConfirmSet] = useState(null);
  const previousComposerTriggerRef = useRef(null);
  const openTimeInputRef = useRef(null);
  const conflictKeepEditingRef = useRef(null);
  const discardKeepEditingRef = useRef(null);
  const previousNonAlwaysOpenRef = useRef(null);
  const alwaysOpen = isStorefrontBusinessHoursAlwaysOpen(hours);
  const allDaysSelected = selectedDays.length === STOREFRONT_BUSINESS_DAY_OPTIONS.length;
  const composerIsDirty = composerOpen && composerSnapshot != null && (
    openTime !== composerSnapshot.open
    || closeTime !== composerSnapshot.close
    || !areDaySelectionsEqual(selectedDays, composerSnapshot.dayKeys)
  );

  useEffect(() => {
    const handlePointerRelease = () => setDragState(null);
    window.addEventListener('mouseup', handlePointerRelease);
    return () => window.removeEventListener('mouseup', handlePointerRelease);
  }, []);

  useEffect(() => {
    if (!pendingConflict && !discardConfirmOpen) return undefined;
    const scheduleFocus = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : window.setTimeout.bind(window);
    const cancelFocus = typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : window.clearTimeout.bind(window);
    const frameId = scheduleFocus(() => {
      const target = pendingConflict ? conflictKeepEditingRef.current : discardKeepEditingRef.current;
      target?.focus();
    });
    return () => cancelFocus(frameId);
  }, [discardConfirmOpen, pendingConflict]);

  const emit = (nextHours) => {
    if (typeof onChange === 'function') onChange(nextHours);
  };

  const commitHours = (nextHours) => {
    emit(nextHours);
    onScheduleCommit?.(nextHours);
  };

  const commitSelectedDays = (dayKeys = selectedDays) => {
    emit(applyStorefrontBusinessHoursRange(hours, {
      open: openTime,
      close: closeTime,
      dayKeys
    }));
  };

  const handleFormAlwaysOpenChange = (checked) => {
    setFormAlwaysOpen(checked);
    if (checked) {
      setOpenTime('00:00');
      setCloseTime('00:00');
      setSelectedDays(ALL_DAY_KEYS);
    }
  };

  const handleAlwaysOpenChange = (checked) => {
    if (checked) {
      if (!alwaysOpen) previousNonAlwaysOpenRef.current = hours;
      emit(setStorefrontBusinessHoursOpenAllDay(hours, true));
      return;
    }
    emit(previousNonAlwaysOpenRef.current || createDefaultStorefrontBusinessHours());
  };

  const setDaySelected = (dayKey, checked) => {
    setSelectedDays((current) => toggleArrayValue(current, dayKey, checked));
  };

  const restoreComposerFocus = () => {
    const trigger = previousComposerTriggerRef.current;
    if (!trigger || !trigger.isConnected) return;
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => trigger.focus());
      return;
    }
    window.setTimeout(() => trigger.focus(), 0);
  };

  const finishCloseComposer = ({ committed = false } = {}) => {
    setComposerOpen(false);
    setEditingSetKey(null);
    setComposerSnapshot(null);
    setPendingConflict(null);
    setDiscardConfirmOpen(false);
    onComposerClose?.({ committed });
    restoreComposerFocus();
  };

  const requestCloseComposer = () => {
    finishCloseComposer();
    return true;
  };

  const handleStartNewSchedule = (event) => {
    previousComposerTriggerRef.current = event?.currentTarget || null;
    setEditingSetKey(null);
    setOpenTime('10:00');
    setCloseTime('21:00');
    setSelectedDays(['mon', 'wed', 'fri']);
    setFormAlwaysOpen(false);
    setComposerSnapshot(createComposerSnapshot('10:00', '21:00', ['mon', 'wed', 'fri']));
    setPendingConflict(null);
    setDiscardConfirmOpen(false);
    setComposerOpen(true);
  };

  const handleEditSet = (set, event) => {
    previousComposerTriggerRef.current = event?.currentTarget || null;
    setEditingSetKey(set.key);
    setOpenTime(set.open);
    setCloseTime(set.close);
    setSelectedDays(set.dayKeys);
    setFormAlwaysOpen(set.open === '00:00' && set.close === '00:00' && set.dayKeys.length === ALL_DAY_KEYS.length);
    setComposerSnapshot(createComposerSnapshot(set.open, set.close, set.dayKeys));
    setPendingConflict(null);
    setDiscardConfirmOpen(false);
    setComposerOpen(true);
  };

  const commitScheduleSet = () => {
    const nextDayKeys = formAlwaysOpen ? ALL_DAY_KEYS : selectedDays;
    const nextOpen = formAlwaysOpen ? '00:00' : openTime;
    const nextClose = formAlwaysOpen ? '00:00' : closeTime;
    if (nextDayKeys.length === 0) return;

    if (editingSetKey) {
      const currentSet = scheduleSets.find((set) => set.key === editingSetKey);
      if (!currentSet) return;

      const clearedHours = {
        ...hours,
        weekly: {
          ...hours.weekly,
          ...Object.fromEntries(currentSet.dayKeys.map((dayKey) => [
            dayKey,
            { ...hours.weekly[dayKey], enabled: false }
          ]))
        }
      };
      commitHours(applyStorefrontBusinessHoursRange(clearedHours, {
        open: nextOpen,
        close: nextClose,
        dayKeys: nextDayKeys
      }));
      finishCloseComposer({ committed: true });
      return;
    }

    commitHours(applyStorefrontBusinessHoursRange(hours, { open: nextOpen, close: nextClose, dayKeys: nextDayKeys }));
    finishCloseComposer({ committed: true });
  };

  const handleSaveScheduleSet = () => {
    const nextDayKeys = formAlwaysOpen ? ALL_DAY_KEYS : selectedDays;
    if (nextDayKeys.length === 0) return;

    const conflicts = getScheduleConflicts(scheduleSets, nextDayKeys, editingSetKey);
    if (conflicts.length > 0) {
      setPendingConflict({
        allDays: nextDayKeys.length === ALL_DAY_KEYS.length,
        conflicts
      });
      setDiscardConfirmOpen(false);
      return;
    }

    commitScheduleSet();
  };

  const handleRemoveSet = (dayKeys) => {
    commitHours({
      ...hours,
      weekly: {
        ...hours.weekly,
        ...Object.fromEntries((Array.isArray(dayKeys) ? dayKeys : []).map((dayKey) => [
          dayKey,
          {
            ...hours.weekly[dayKey],
            enabled: false
          }
        ]))
      }
    });
    if (editingSetKey) requestCloseComposer();
  };

  return (
    <div className={`min-w-0 max-w-full space-y-2 ${className} sm:space-y-3`}>
      {showHeader ? (
        <div className="flex flex-row items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none">
          {headerContent || (
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="4" y="5.5" width="16" height="14" rx="2" />
                  <path d="M8 3.5v4M16 3.5v4M4 9.5h16M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" strokeLinecap="round" />
                </svg>
              </span>
              <div className="min-w-0">
                <h3 className="text-[14px] font-extrabold text-slate-950">Business Hours</h3>
                <p className="mt-0.5 text-[12px] leading-5 text-slate-500">Set when customers can place orders from your storefront.</p>
              </div>
            </div>
          )}

        </div>
      ) : null}

      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {!hideScheduleSummaryHeader || !composerOpen ? (
          <div className={`flex items-center gap-2 border-b border-slate-200 px-2.5 py-2 sm:gap-3 sm:px-4 sm:py-3 ${hideScheduleSummaryHeader ? 'justify-end' : 'flex-wrap justify-between max-sm:flex-col max-sm:items-stretch'}`}>
            {!hideScheduleSummaryHeader ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 sm:h-8 sm:w-8 sm:rounded-lg">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="4" y="5.5" width="16" height="14" rx="2" />
                    <path d="M8 3.5v4M16 3.5v4M4 9.5h16" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h4 className="text-[11px] font-bold text-slate-950 sm:text-[13px]">Current Schedule</h4>
                  <p className="mt-0.5 text-[12px] leading-5 text-slate-500">This is how your business hours will appear on your storefront.</p>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              aria-label={composerOpen ? 'Start another schedule set' : 'Add Schedule Set'}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#1A4E8D] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#153f73] disabled:cursor-not-allowed disabled:opacity-60 max-sm:w-full sm:text-[12px]"
              disabled={disabled}
              onClick={handleStartNewSchedule}
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 4v12M4 10h12" strokeLinecap="round" />
              </svg>
              Add Schedule Set
            </button>
          </div>
        ) : null}

        {scheduleSets.length > 0 ? (
          <div className="space-y-1.5 p-2.5 sm:space-y-0 sm:divide-y sm:divide-slate-100 sm:p-0">
            {scheduleSets.map((set) => (
              <React.Fragment key={set.key}>
              <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-0.5 rounded-lg bg-slate-50 px-2.5 py-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:rounded-none sm:bg-white sm:px-4 sm:py-3 ${editingSetKey === set.key ? 'border border-blue-300 bg-blue-50/40 sm:border-x-0' : ''}`}>
                <div className="flex min-w-0 items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 sm:h-8 sm:w-8">
                    <svg viewBox="0 0 24 24" className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="12" r="8" />
                      <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-[12px] font-semibold text-slate-900">{formatScheduleDayLabel(set.dayKeys)}</p>
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold leading-3 text-emerald-700 sm:hidden">
                        <span className="h-1 w-1 rounded-full bg-emerald-500" aria-hidden="true" />
                        Open
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-slate-500">{formatScheduleTimeLabel(set)}</p>
                  </div>
                </div>

                <span className="hidden w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  Open
                </span>

                <div className="col-start-2 row-start-1 flex items-center gap-0.5 sm:col-start-3 sm:row-start-1 sm:justify-end sm:gap-1.5">
                  <button
                    type="button"
                    aria-label={`Edit ${formatScheduleDayLabel(set.dayKeys)} schedule`}
                    title={`Edit ${formatScheduleDayLabel(set.dayKeys)} schedule`}
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-blue-200 text-blue-700 transition hover:bg-blue-50 sm:h-9 sm:w-9 sm:rounded-full disabled:cursor-not-allowed disabled:opacity-60 ${editingSetKey === set.key ? 'bg-blue-100 ring-2 ring-blue-100' : ''}`}
                    disabled={disabled}
                    onClick={(event) => handleEditSet(set, event)}
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M13.5 5.5l5 5M5 19l3.5-.8L18.8 7.9a1.8 1.8 0 0 0 0-2.5l-.2-.2a1.8 1.8 0 0 0-2.5 0L5.8 14.5 5 19Z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${formatScheduleDayLabel(set.dayKeys)} schedule`}
                    title={`Remove ${formatScheduleDayLabel(set.dayKeys)} schedule`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50 sm:h-9 sm:w-9 sm:rounded-full disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={disabled}
                    onClick={() => setDeleteConfirmSet(set)}
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M5 7h14M10 11v5M14 11v5M8 7l.7-2h6.6l.7 2M7 7l.7 13h8.6L17 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
              {composerOpen && editingSetKey === set.key ? <ScheduleForm mode="edit" alwaysOpen={formAlwaysOpen} openTime={openTime} closeTime={closeTime} selectedDays={selectedDays} disabled={disabled} onAlwaysOpenChange={handleFormAlwaysOpenChange} onOpenTimeChange={setOpenTime} onCloseTimeChange={setCloseTime} onDayChange={setSelectedDays} onCancel={requestCloseComposer} onSubmit={handleSaveScheduleSet} /> : null}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="px-3 py-4 text-center text-[10px] text-slate-500 sm:px-4 sm:py-5 sm:text-[11px]">No open schedule sets yet.</div>
        )}
        {composerOpen && !editingSetKey ? <ScheduleForm mode="add" alwaysOpen={formAlwaysOpen} openTime={openTime} closeTime={closeTime} selectedDays={selectedDays} disabled={disabled} onAlwaysOpenChange={handleFormAlwaysOpenChange} onOpenTimeChange={setOpenTime} onCloseTimeChange={setCloseTime} onDayChange={setSelectedDays} onCancel={requestCloseComposer} onSubmit={handleSaveScheduleSet} /> : null}
      </section>

      {pendingConflict ? (
        <Dialog open onOpenChange={(open) => { if (!open) setPendingConflict(null); }}>
          <DialogContent aria-labelledby="storefront-business-hours-conflict-title" aria-describedby="storefront-business-hours-conflict-description" className="w-[calc(100vw-2rem)] max-w-lg rounded-xl border-amber-200 bg-white p-0">
            <DialogHeader className="border-b border-amber-100 bg-amber-50 px-5 py-4 text-left">
              <DialogTitle id="storefront-business-hours-conflict-title" className="text-[15px] font-extrabold text-amber-950">{pendingConflict.allDays ? 'Apply this time to all days?' : 'Replace existing schedule?'}</DialogTitle>
              <DialogDescription id="storefront-business-hours-conflict-description" className="mt-1 text-[12px] leading-5 text-amber-900">This will replace the existing time sets for the selected days.</DialogDescription>
            </DialogHeader>
            <div className="px-5 py-4 text-[12px] leading-5 text-slate-700">
              {pendingConflict.conflicts.map((set) => <p key={set.key}><span className="font-bold text-slate-900">{formatScheduleDayLabel(set.overlappingDayKeys)}</span> currently uses {formatScheduleTimeLabel(set)}.</p>)}
            </div>
            <DialogFooter className="flex-row justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button ref={conflictKeepEditingRef} type="button" className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-[12px] font-bold text-slate-800" disabled={disabled} onClick={() => setPendingConflict(null)}>Keep editing</button>
              <button type="button" className="min-h-10 rounded-lg bg-amber-700 px-4 text-[12px] font-extrabold text-white" disabled={disabled} onClick={() => commitScheduleSet()}>Apply to All Days</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {deleteConfirmSet ? (
        <Dialog open onOpenChange={(open) => { if (!open) setDeleteConfirmSet(null); }}>
          <DialogContent aria-labelledby="storefront-business-hours-delete-title" aria-describedby="storefront-business-hours-delete-description" className="w-[calc(100vw-2rem)] max-w-lg rounded-xl border-red-200 bg-white p-0">
            <DialogHeader className="border-b border-red-100 bg-red-50 px-5 py-4 text-left">
              <DialogTitle id="storefront-business-hours-delete-title" className="text-[15px] font-extrabold text-red-950">Remove schedule set?</DialogTitle>
              <DialogDescription id="storefront-business-hours-delete-description" className="mt-1 text-[12px] leading-5 text-red-900">Remove the {formatScheduleDayLabel(deleteConfirmSet.dayKeys)} schedule? This cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-row justify-end gap-2 px-5 py-4">
              <button type="button" className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-[12px] font-bold text-slate-800" onClick={() => setDeleteConfirmSet(null)}>Cancel</button>
              <button type="button" className="min-h-10 rounded-lg bg-red-600 px-4 text-[12px] font-extrabold text-white" onClick={() => { handleRemoveSet(deleteConfirmSet.dayKeys); setDeleteConfirmSet(null); }}>Delete</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* The retired modal editor was replaced by the inline schedule form above. */}
      {/*
        <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen) requestCloseComposer(); }} overlayClassName="bg-black/30 backdrop-blur-none">
          <DialogContent
            id="storefront-business-hours-schedule-set-editor"
            aria-labelledby="storefront-business-hours-schedule-set-title"
            aria-describedby="storefront-business-hours-schedule-set-description"
            className="flex w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full"
          >
            <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 text-left sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle id="storefront-business-hours-schedule-set-title" className="text-[16px] font-extrabold text-[#0F172A]">
                    {editingSetKey ? 'Edit Schedule Set' : 'Add Schedule Set'}
                  </DialogTitle>
                  <DialogDescription id="storefront-business-hours-schedule-set-description" className="mt-1 text-[12px] leading-5 text-[#64748B]">
                    Choose the hours and days for this storefront schedule.
                  </DialogDescription>
                  {draftNotice ? (
                    <p className="mt-2 rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] leading-5 text-[#1A4E8D] sm:text-[12px]">
                      {draftNotice}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Close schedule set editor"
                  title="Close"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"
                  onClick={requestCloseComposer}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </DialogHeader>

            <form
              id="storefront-business-hours-schedule-set-form"
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveScheduleSet();
              }}
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
                <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
                  <div className="col-span-1 min-w-0 sm:col-span-2 lg:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-600 sm:text-[12px]">Hours</span>
                      <DayChip
                        label="24 hours"
                        accessibleLabel="Use 24 hours"
                        checked={twentyFourHoursSelected}
                        disabled={disabled}
                        className="min-h-8 px-2 py-1 text-[10px] sm:min-h-8 sm:px-2.5 sm:py-1.5 sm:text-[12px]"
                        onClick={handleUseTwentyFourHours}
                      />
                    </div>
                    <div className="mt-1.5 grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
                      <TimeField
                        label="Open Time"
                        value={openTime}
                        disabled={disabled}
                        inputRef={openTimeInputRef}
                        autoFocus
                        onChange={(event) => setOpenTime(event.target.value)}
                      />
                      <TimeField
                        label="Close Time"
                        value={closeTime}
                        disabled={disabled}
                        onChange={(event) => setCloseTime(event.target.value)}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] leading-4 text-slate-500 sm:text-[11px]">Use 24 hours for the selected days only.</p>
                  </div>
                  <div className="col-span-1 min-w-0 sm:col-span-2 lg:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-600 sm:text-[12px]">Applies to</span>
                      <DayChip
                        label="All days"
                        accessibleLabel={allDaysSelected ? 'Clear all days' : 'Select All Days'}
                        checked={allDaysSelected}
                        disabled={disabled}
                        className="min-h-8 px-2 py-1 text-[10px] sm:min-h-8 sm:px-2.5 sm:py-1.5 sm:text-[12px]"
                        onClick={() => setSelectedDays(allDaysSelected ? [] : ALL_DAY_KEYS)}
                      />
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1 sm:gap-1.5">
                      {STOREFRONT_BUSINESS_DAY_OPTIONS.slice(1).concat(STOREFRONT_BUSINESS_DAY_OPTIONS.slice(0, 1)).map((day) => {
                        const checked = selectedDays.includes(day.key);
                        return (
                          <DayChip
                            key={`business-day-select-${day.key}`}
                            label={day.label}
                            accessibleLabel={`Select ${day.label}`}
                            checked={checked}
                            disabled={disabled}
                            onMouseDown={() => {
                              if (disabled) return;
                              setDragState({ checked: !checked });
                            }}
                            onMouseEnter={() => {
                              if (!dragState || disabled) return;
                              setDaySelected(day.key, dragState.checked);
                            }}
                            onClick={() => setDaySelected(day.key, !checked)}
                          />
                        );
                      })}
                    </div>
                    <div aria-live="polite" className="mt-2 min-h-5 text-[10px] leading-4 text-slate-500 sm:text-[11px]">
                      {selectedDays.length > 0 ? (
                        <>Will apply to <span className="font-bold text-slate-700">{formatScheduleDayLabel(selectedDays)}</span> at <span className="font-bold text-slate-700">{formatScheduleTimeLabel({ open: openTime, close: closeTime })}</span>.</>
                      ) : (
                        <span role="alert" className="font-semibold text-amber-700">Select at least one day to continue.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {pendingConflict ? (
                <ScheduleSetConflictPanel
                  conflict={pendingConflict}
                  disabled={disabled}
                  keepEditingRef={conflictKeepEditingRef}
                  onKeepEditing={() => setPendingConflict(null)}
                  onConfirm={() => commitScheduleSet()}
                />
              ) : discardConfirmOpen ? (
                <section
                  role="alertdialog"
                  aria-labelledby="storefront-business-hours-schedule-set-discard-title"
                  aria-describedby="storefront-business-hours-schedule-set-discard-description"
                  className="border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6"
                >
                  <h3 id="storefront-business-hours-schedule-set-discard-title" className="text-[13px] font-extrabold text-slate-950 sm:text-[14px]">Discard schedule changes?</h3>
                  <p id="storefront-business-hours-schedule-set-discard-description" className="mt-1 text-[11px] leading-5 text-slate-600 sm:text-[12px]">Your changes have not been added to the Business Hours draft.</p>
                  <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      ref={discardKeepEditingRef}
                      type="button"
                      className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-bold text-slate-800 transition hover:bg-slate-100 sm:flex-none"
                      disabled={disabled}
                      onClick={() => setDiscardConfirmOpen(false)}
                    >
                      Keep editing
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-slate-800 px-3 py-2 text-[12px] font-extrabold text-white transition hover:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                      disabled={disabled}
                      onClick={() => finishCloseComposer()}
                    >
                      Discard changes
                    </button>
                  </div>
                </section>
              ) : (
                <DialogFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
                  <button
                    type="button"
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-bold text-[#0F172A] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:text-[14px]"
                    disabled={disabled}
                    onClick={requestCloseComposer}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#1A4E8D] px-3 py-2 text-[13px] font-extrabold text-white transition hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:text-[14px]"
                    disabled={disabled || selectedDays.length === 0}
                  >
                    {editingSetKey ? (
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 10.5l3.5 3.5L16 5.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                      </svg>
                    )}
                    {editingSetKey ? 'Update Schedule Set' : 'Add Schedule Set'}
                  </button>
                </DialogFooter>
              )}
            </form>
          </DialogContent>
        </Dialog>
      */}
    </div>
  );
}
