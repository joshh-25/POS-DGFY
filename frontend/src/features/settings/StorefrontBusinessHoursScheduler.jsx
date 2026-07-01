import React, { useEffect, useMemo, useRef, useState } from 'react';
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

function TimeField({
  label,
  value,
  disabled,
  onChange
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold text-slate-700">{label}</span>
      <div className="relative">
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
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-14 pr-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
  checked,
  disabled,
  onMouseDown,
  onMouseEnter,
  onChange,
  variant = 'default'
}) {
  const checkedClasses = variant === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-blue-600 bg-blue-600 text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)]';

  return (
    <label
      className={`inline-flex min-h-10 select-none items-center gap-2 rounded-2xl border px-3.5 py-2 text-[13px] font-semibold transition ${checked ? checkedClasses : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      {checked && variant !== 'success' ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 10.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {label}
    </label>
  );
}

function ConfirmAllDaysModal({
  open,
  disabled,
  onCancel,
  onConfirm
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/18 px-4">
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
    </div>
  );
}

export default function StorefrontBusinessHoursScheduler({
  value,
  onChange,
  disabled = false,
  className = ''
}) {
  const hours = useMemo(() => normalizeStorefrontBusinessHours(value), [value]);
  const scheduleSets = useMemo(() => buildScheduleSets(hours), [hours]);
  const closedDayKeys = useMemo(() => buildClosedDays(hours), [hours]);
  const [openTime, setOpenTime] = useState('10:00');
  const [closeTime, setCloseTime] = useState('21:00');
  const [selectedDays, setSelectedDays] = useState(['mon', 'wed', 'fri']);
  const [dragState, setDragState] = useState(null);
  const [showAllDaysConfirm, setShowAllDaysConfirm] = useState(false);
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

  const commitSelectedDays = (dayKeys = selectedDays) => {
    emit(applyStorefrontBusinessHoursRange(hours, {
      open: openTime,
      close: closeTime,
      dayKeys
    }));
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

  const handleAddTimeSet = () => {
    if (selectedDays.length === 0) return;
    if (selectedDays.length === ALL_DAY_KEYS.length && scheduleSets.length > 0) {
      setShowAllDaysConfirm(true);
      return;
    }
    commitSelectedDays();
  };

  const handleRemoveSet = (dayKeys) => {
    emit({
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
    emit({
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
    <div className={`space-y-5 ${className}`}>
      <div className="bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-[24px] font-semibold tracking-tight text-slate-950">Business Hours</h3>
            <p className="mt-1.5 text-[15px] text-slate-500">Create reusable store hour schedules and preview how they apply across the week.</p>
            <p className="mt-2 text-[13px] font-medium text-slate-500">Preview: {formatStorefrontBusinessHoursDisplay(hours)}</p>
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

        <section className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-6">
          <h4 className="text-[22px] font-semibold tracking-tight text-slate-950">Create Time Set</h4>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,220px)_minmax(0,220px)_1px_minmax(0,1fr)_auto] xl:items-end">
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
              <div className="flex flex-wrap gap-2">
                <DayChip
                  label="All Days"
                  checked={allDaysSelected}
                  disabled={disabled}
                  onChange={(event) => setSelectedDays(event.target.checked ? ALL_DAY_KEYS : [])}
                />

                {STOREFRONT_BUSINESS_DAY_OPTIONS.slice(1).concat(STOREFRONT_BUSINESS_DAY_OPTIONS.slice(0, 1)).map((day) => {
                  const checked = selectedDays.includes(day.key);
                  return (
                    <DayChip
                      key={`business-day-select-${day.key}`}
                      label={day.label}
                      checked={checked}
                      disabled={disabled}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        if (disabled) return;
                        const nextChecked = !checked;
                        setDragState({ checked: nextChecked });
                        setDaySelected(day.key, nextChecked);
                      }}
                      onMouseEnter={() => {
                        if (!dragState || disabled) return;
                        setDaySelected(day.key, dragState.checked);
                      }}
                      onChange={(event) => setDaySelected(day.key, event.target.checked)}
                    />
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="inline-flex min-h-11 min-w-[180px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(37,99,235,0.32)] transition hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled || selectedDays.length === 0}
              onClick={handleAddTimeSet}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 4v12M4 10h12" strokeLinecap="round" />
              </svg>
              Add Time Set
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-6">
          <h4 className="text-[22px] font-semibold tracking-tight text-slate-950">Schedule Sets</h4>

          <div className="mt-6 overflow-hidden rounded-[22px] border border-slate-200">
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_92px] items-center gap-4 border-b border-slate-200 bg-slate-50/90 px-6 py-4 text-sm font-semibold text-slate-500">
              <span>Time Range</span>
              <span>Applies to</span>
              <span className="text-right"> </span>
            </div>

            {scheduleSets.length > 0 ? (
              <div className="divide-y divide-slate-200 bg-white">
                {scheduleSets.map((set) => {
                  const appliesToAll = set.dayKeys.length === ALL_DAY_KEYS.length;
                  return (
                    <div key={set.key} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_92px] items-center gap-4 px-6 py-5">
                      <div className="flex items-center gap-3 text-lg font-medium text-slate-800">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <circle cx="12" cy="12" r="8" />
                            <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span>{formatTimeLabel(set.open)} - {formatTimeLabel(set.close)}</span>
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

                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                          disabled={disabled}
                          onClick={() => handleRemoveSet(set.dayKeys)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
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
