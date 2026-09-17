import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  STOREFRONT_BUSINESS_DAY_OPTIONS,
  applyStorefrontBusinessHoursRange,
  createDefaultStorefrontBusinessHours,
  formatStorefrontBusinessHoursDisplay,
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

const buildClosedDays = (hours) => ALL_DAY_KEYS.filter((dayKey) => hours.weekly?.[dayKey]?.enabled !== true);

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
  const normalizedKeys = Array.from(new Set(Array.isArray(dayKeys) ? dayKeys : []))
    .filter((dayKey) => ALL_DAY_KEYS.includes(dayKey))
    .sort((left, right) => ALL_DAY_KEYS.indexOf(left) - ALL_DAY_KEYS.indexOf(right));

  if (normalizedKeys.length === ALL_DAY_KEYS.length) return 'All days';
  if (normalizedKeys.length === 0) return 'No days selected';

  const indexes = normalizedKeys.map((dayKey) => ALL_DAY_KEYS.indexOf(dayKey));
  const isContiguous = indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1);
  if (isContiguous && normalizedKeys.length > 1) {
    return `${FULL_DAY_LABELS[normalizedKeys[0]]} - ${FULL_DAY_LABELS[normalizedKeys[normalizedKeys.length - 1]]}`;
  }

  return normalizedKeys.map((dayKey) => FULL_DAY_LABELS[dayKey]).join(', ');
};

const replaceScheduleSet = (hours, existingSet, nextDayKeys, open, close) => {
  const weekly = { ...(hours?.weekly || {}) };
  (existingSet?.dayKeys || []).forEach((dayKey) => {
    weekly[dayKey] = {
      ...(weekly[dayKey] || {}),
      enabled: false
    };
  });
  (nextDayKeys || []).forEach((dayKey) => {
    weekly[dayKey] = {
      ...(weekly[dayKey] || {}),
      enabled: true,
      open,
      close,
      intervals: [{ open, close }]
    };
  });
  return { ...hours, weekly };
};

function TimeField({
  label,
  value,
  disabled,
  onChange
}) {
  return (
    <label className="block min-w-0 max-w-full">
      <span className="mb-2 block text-[13px] font-semibold text-slate-700">{label}</span>
      <div className="relative min-w-0 max-w-full">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <input
          type="time"
          className="h-11 w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white pl-14 pr-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
    : 'border-blue-600 bg-blue-600 text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)]';

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      aria-pressed={checked}
      disabled={disabled}
      className={`inline-flex min-h-10 select-none items-center gap-2 rounded-2xl border px-3.5 py-2 text-[13px] font-semibold transition ${checked ? checkedClasses : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'} ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${className}`}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {checked && variant !== 'success' ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 10.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {label}
    </button>
  );
}

function ConfirmAllDaysModal({
  open,
  disabled,
  onCancel,
  onConfirm
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/18 px-4">
      <div className="w-full max-w-[640px] rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:p-8">
        <div className="flex justify-end">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            onClick={onCancel}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4.5" y="6.5" width="15" height="13" rx="2.5" />
            <path d="M8 4.5v4M16 4.5v4M4.5 10.5h15" strokeLinecap="round" />
          </svg>
        </div>

        <div className="mt-6 text-center">
          <h4 className="text-[24px] font-semibold tracking-tight text-slate-950">Apply this time to all days?</h4>
          <p className="mx-auto mt-3 max-w-md text-base leading-7 text-slate-500">
            This will replace the existing time sets for Mon, Tue, Wed, Thu, Fri, Sat, and Sun.
          </p>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 text-base font-semibold text-white shadow-[0_16px_34px_rgba(37,99,235,0.32)] transition hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              onClick={onConfirm}
            >
              Apply to All Days
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function StorefrontBusinessHoursScheduler({
  value,
  onChange,
  disabled = false,
  className = '',
  showHeader = true,
  hideScheduleSummaryHeader = false,
  initialComposerOpen = false,
  draftNotice = '',
  onComposerClose,
  onScheduleCommit,
  headerContent = null
}) {
  const hours = useMemo(() => normalizeStorefrontBusinessHours(value), [value]);
  const scheduleSets = useMemo(() => buildScheduleSets(hours), [hours]);
  const closedDayKeys = useMemo(() => buildClosedDays(hours), [hours]);
  const [openTime, setOpenTime] = useState('10:00');
  const [closeTime, setCloseTime] = useState('21:00');
  const [selectedDays, setSelectedDays] = useState(['mon', 'wed', 'fri']);
  const [dragState, setDragState] = useState(null);
  const [showAllDaysConfirm, setShowAllDaysConfirm] = useState(false);
  const inlinePreview = showHeader === false;
  const [composerOpen, setComposerOpen] = useState(() => inlinePreview && initialComposerOpen);
  const [editingSetKey, setEditingSetKey] = useState(null);
  const previousNonAlwaysOpenRef = useRef(null);
  const alwaysOpen = isStorefrontBusinessHoursAlwaysOpen(hours);
  const allDaysSelected = selectedDays.length === STOREFRONT_BUSINESS_DAY_OPTIONS.length;

  useEffect(() => {
    const handlePointerRelease = () => setDragState(null);
    window.addEventListener('mouseup', handlePointerRelease);
    return () => window.removeEventListener('mouseup', handlePointerRelease);
  }, []);

  const emit = (nextHours) => {
    if (typeof onChange === 'function') onChange(nextHours);
  };

  const commitSchedule = (nextHours) => {
    if (typeof onScheduleCommit === 'function') {
      void onScheduleCommit(nextHours);
      return;
    }
    emit(nextHours);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setEditingSetKey(null);
    onComposerClose?.();
  };

  const commitSelectedDays = (dayKeys = selectedDays) => {
    const nextHours = editingSetKey
      ? replaceScheduleSet(hours, scheduleSets.find((set) => set.key === editingSetKey), dayKeys, openTime, closeTime)
      : applyStorefrontBusinessHoursRange(hours, {
      open: openTime,
      close: closeTime,
      dayKeys
    });
    commitSchedule(nextHours);
    if (inlinePreview) closeComposer();
  };

  const handleAlwaysOpenChange = (checked) => {
    if (checked) {
      if (!alwaysOpen) previousNonAlwaysOpenRef.current = hours;
      commitSchedule(setStorefrontBusinessHoursOpenAllDay(hours, true));
      return;
    }
    commitSchedule(previousNonAlwaysOpenRef.current || createDefaultStorefrontBusinessHours());
  };

  const setDaySelected = (dayKey, checked) => {
    setSelectedDays((current) => toggleArrayValue(current, dayKey, checked));
  };

  const handleAddTimeSet = () => {
    if (selectedDays.length === 0) return;
    if (selectedDays.length === ALL_DAY_KEYS.length && scheduleSets.length > 0) {
      setShowAllDaysConfirm(true);
      return;
    }
    commitSelectedDays();
  };

  const handleEditScheduleSet = (set) => {
    setOpenTime(set.open);
    setCloseTime(set.close);
    setSelectedDays(set.dayKeys);
    setEditingSetKey(set.key);
    setComposerOpen(true);
  };

  const handleRemoveSet = (dayKeys) => {
    commitSchedule({
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
  };

  const handleClosedDayToggle = (dayKey, enabled) => {
    commitSchedule({
      ...hours,
      weekly: {
        ...hours.weekly,
        [dayKey]: {
          ...hours.weekly[dayKey],
          enabled
        }
      }
    });
  };

  return (
    <div className={`min-w-0 max-w-full space-y-5 ${className}`}>
      <div className="bg-white">
        {showHeader ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {headerContent || (
                <>
                  <h3 className="text-[24px] font-semibold tracking-tight text-slate-950">Business Hours</h3>
                  <p className="mt-1.5 text-[15px] text-slate-500">Create reusable store hour schedules and preview how they apply across the week.</p>
                  <p className="mt-2 text-[13px] font-medium text-slate-500">Preview: {formatStorefrontBusinessHoursDisplay(hours)}</p>
                </>
              )}
              {draftNotice ? <p className="mt-2 text-[13px] font-medium text-slate-500">{draftNotice}</p> : null}
            </div>

            <label className="inline-flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={alwaysOpen}
                disabled={disabled}
                onChange={(event) => handleAlwaysOpenChange(event.target.checked)}
              />
              Open 24/7
            </label>
          </div>
        ) : null}

        {inlinePreview && !composerOpen ? null : (
        <form
          className="mt-6 min-w-0 max-w-full rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            handleAddTimeSet();
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h4 className="text-[22px] font-semibold tracking-tight text-slate-950">{inlinePreview ? (editingSetKey ? 'Edit Schedule Set' : 'Add New Schedule Set') : 'Create Time Set'}</h4>
            {inlinePreview ? (
              <button type="button" className="rounded-lg px-3 py-2 text-[12px] font-bold text-slate-600 hover:bg-slate-100" onClick={closeComposer}>
                Cancel
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid min-w-0 max-w-full gap-5 [&>*]:min-w-0 xl:grid-cols-[minmax(0,220px)_minmax(0,220px)_1px_minmax(0,1fr)_auto] xl:items-end">
            <TimeField
              label="Open Time"
              value={openTime}
              disabled={disabled}
              onChange={(event) => setOpenTime(event.target.value)}
            />
            <TimeField
              label="Close Time"
              value={closeTime}
              disabled={disabled}
              onChange={(event) => setCloseTime(event.target.value)}
            />
            <div className="hidden h-[64px] w-px bg-slate-200 xl:block" />

            <div>
              <span className="mb-2 block text-sm font-semibold text-slate-700">Applies to</span>
              {/* Mobile only (below sm:): 2-column grid, order preserved (All Days, Mon-Sat, Sun).
                  sm: and up reverts to the original flex-wrap pill row - untouched. */}
              <div className="time-sets-days grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <DayChip
                  label="All Days"
                  accessibleLabel="Select All Days"
                  checked={allDaysSelected}
                  disabled={disabled}
                  onClick={() => setSelectedDays(allDaysSelected ? [] : ALL_DAY_KEYS)}
                  className="time-sets-day-item max-sm:w-full max-sm:justify-center"
                />

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
                      className="time-sets-day-item max-sm:w-full max-sm:justify-center"
                    />
                  );
                })}
              </div>
            </div>

            <button
              type={inlinePreview ? 'submit' : 'button'}
              className="inline-flex min-h-11 min-w-[180px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(37,99,235,0.32)] transition hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled || selectedDays.length === 0}
              onClick={inlinePreview ? undefined : handleAddTimeSet}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 4v12M4 10h12" strokeLinecap="round" />
              </svg>
              {inlinePreview ? (editingSetKey ? 'Save Changes' : 'Add Schedule Set') : 'Add Time Set'}
            </button>
          </div>
        </form>
        )}

        <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-6">
          {!hideScheduleSummaryHeader || inlinePreview ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-[22px] font-semibold tracking-tight text-slate-950">{inlinePreview ? 'Current Schedule' : 'Schedule Sets'}</h4>
                {inlinePreview ? <p className="mt-1 text-[13px] text-slate-500">This is how your business hours will appear on your storefront.</p> : null}
              </div>
              {inlinePreview ? (
                <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60" disabled={disabled} onClick={() => { setEditingSetKey(null); setComposerOpen(true); }}>
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 4v12M4 10h12" strokeLinecap="round" /></svg>
                  Add Schedule Set
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 overflow-hidden rounded-[22px] border border-slate-200">
            {/* Column header only applies to the desktop/tablet table layout below. */}
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_92px] items-center gap-4 border-b border-slate-200 bg-slate-50/90 px-6 py-4 text-sm font-semibold text-slate-500 sm:grid">
              <span>Time Range</span>
              <span>Applies to</span>
              <span className="text-right"> </span>
            </div>

            {scheduleSets.length > 0 ? (
              <div className="divide-y divide-slate-200 bg-white">
                {scheduleSets.map((set) => {
                  const appliesToAll = set.dayKeys.length === ALL_DAY_KEYS.length;
                  return (
                    <React.Fragment key={set.key}>
                      {/* Mobile only: time range + Remove stay on row 1 (.time-set-header),
                          selected days move to a 2-column grid below (.time-set-days). */}
                      <div className="time-set-item flex flex-col gap-3 px-6 py-5 sm:hidden">
                        <div className="time-set-header flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3 text-lg font-medium text-slate-800">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500">
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <circle cx="12" cy="12" r="8" />
                                <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            <span className="min-w-0">
                              {inlinePreview ? <span className="block truncate text-[13px] font-extrabold text-slate-900">{formatScheduleDayLabel(set.dayKeys)}</span> : null}
                              <span className="block text-[14px]">{formatTimeLabel(set.open)} - {formatTimeLabel(set.close)}</span>
                            </span>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {inlinePreview ? (
                              <button type="button" className="rounded-xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60" disabled={disabled} aria-label={`Edit ${formatScheduleDayLabel(set.dayKeys)} schedule`} onClick={() => handleEditScheduleSet(set)}>
                                Edit
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                              disabled={disabled}
                              aria-label={inlinePreview ? `Remove ${formatScheduleDayLabel(set.dayKeys)} schedule` : undefined}
                              onClick={() => handleRemoveSet(set.dayKeys)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="time-set-days grid grid-cols-2 gap-2">
                          {appliesToAll ? (
                            <DayChip label="All days" checked disabled variant="success" className="time-set-day w-full justify-center" />
                          ) : (
                            set.dayKeys.map((dayKey) => {
                              const day = STOREFRONT_BUSINESS_DAY_OPTIONS.find((entry) => entry.key === dayKey);
                              return <DayChip key={`${set.key}-${dayKey}-mobile`} label={day?.label || dayKey} checked disabled className="time-set-day w-full justify-center" />;
                            })
                          )}
                        </div>
                      </div>

                      {/* Desktop/tablet: original 3-column table row, unchanged. */}
                      <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_92px] items-center gap-4 px-6 py-5 sm:grid">
                        <div className="flex min-w-0 items-center gap-3 text-lg font-medium text-slate-800">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500">
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <circle cx="12" cy="12" r="8" />
                              <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="min-w-0">
                            {inlinePreview ? <span className="block truncate text-[13px] font-extrabold text-slate-900">{set.dayKeys.map((dayKey) => STOREFRONT_BUSINESS_DAY_OPTIONS.find((entry) => entry.key === dayKey)?.label || dayKey).join(', ')}</span> : null}
                            <span className="block text-[14px]">{formatTimeLabel(set.open)} - {formatTimeLabel(set.close)}</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {appliesToAll ? (
                            <DayChip label="All days" checked disabled variant="success" />
                          ) : (
                            set.dayKeys.map((dayKey) => {
                              const day = STOREFRONT_BUSINESS_DAY_OPTIONS.find((entry) => entry.key === dayKey);
                              return <DayChip key={`${set.key}-${dayKey}`} label={day?.label || dayKey} checked disabled />;
                            })
                          )}
                        </div>

                        <div className="flex justify-end gap-2">
                          {inlinePreview ? (
                            <button type="button" className="rounded-xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60" disabled={disabled} aria-label="Edit schedule" onClick={() => handleEditScheduleSet(set)}>
                              Edit
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                            disabled={disabled}
                            aria-label={inlinePreview ? `Remove ${formatScheduleDayLabel(set.dayKeys)} schedule` : undefined}
                            onClick={() => handleRemoveSet(set.dayKeys)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-base text-slate-400">No schedule sets yet.</div>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Closed days</p>
                <p className="mt-1 text-sm text-slate-500">Use this only when you need a day to stay closed instead of following a time set.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {STOREFRONT_BUSINESS_DAY_OPTIONS.map((day) => {
                  const isClosed = closedDayKeys.includes(day.key);
                  return (
                    <DayChip
                      key={`closed-day-${day.key}`}
                      label={day.label}
                      checked={isClosed}
                      disabled={disabled}
                      variant="success"
                      onChange={(event) => handleClosedDayToggle(day.key, !event.target.checked)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      <ConfirmAllDaysModal
        open={showAllDaysConfirm}
        disabled={disabled}
        onCancel={() => setShowAllDaysConfirm(false)}
        onConfirm={() => {
          commitSelectedDays(ALL_DAY_KEYS);
          setShowAllDaysConfirm(false);
        }}
      />
    </div>
  );
}
