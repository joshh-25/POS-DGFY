import React, { useMemo, useRef, useState } from 'react';
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

const timeToMinutes = (value) => {
  const [hourRaw, minuteRaw] = String(value || '').split(':');
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return Math.max(0, Math.min(1440, (hour * 60) + minute));
};

const getBlockStyle = (dayHours = {}) => {
  if (!dayHours.enabled) return null;
  if (dayHours.open === dayHours.close) {
    return { left: '0%', width: '100%' };
  }
  const openMinutes = timeToMinutes(dayHours.open);
  const closeMinutes = timeToMinutes(dayHours.close);
  if (openMinutes == null || closeMinutes == null) return null;
  const start = Math.min(openMinutes, closeMinutes);
  const end = Math.max(openMinutes, closeMinutes);
  const width = Math.max(4, ((end - start) / 1440) * 100);
  return {
    left: `${(start / 1440) * 100}%`,
    width: `${width}%`
  };
};

export default function StorefrontBusinessHoursScheduler({
  value,
  onChange,
  disabled = false,
  className = ''
}) {
  const hours = useMemo(() => normalizeStorefrontBusinessHours(value), [value]);
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('17:00');
  const [selectedDays, setSelectedDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [dragState, setDragState] = useState(null);
  const previousNonAlwaysOpenRef = useRef(null);
  const alwaysOpen = isStorefrontBusinessHoursAlwaysOpen(hours);
  const allDaysSelected = selectedDays.length === STOREFRONT_BUSINESS_DAY_OPTIONS.length;

  const emit = (nextHours) => {
    if (typeof onChange === 'function') onChange(nextHours);
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

  const handleApply = () => {
    if (selectedDays.length === 0) return;
    emit(applyStorefrontBusinessHoursRange(hours, {
      open: openTime,
      close: closeTime,
      dayKeys: selectedDays
    }));
  };

  const handleGridDayPatch = (dayKey, patch) => {
    emit({
      ...hours,
      weekly: {
        ...hours.weekly,
        [dayKey]: {
          ...hours.weekly[dayKey],
          ...patch
        }
      }
    });
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-900">Business hours</p>
          <p className="mt-1 text-xs text-slate-500">Preview: {formatStorefrontBusinessHoursDisplay(hours)}</p>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={alwaysOpen}
            disabled={disabled}
            onChange={(event) => handleAlwaysOpenChange(event.target.checked)}
          />
          Open 24/7
        </label>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-medium text-slate-700">
            Open time
            <input
              type="time"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
              value={openTime}
              disabled={disabled}
              onChange={(event) => setOpenTime(event.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Close time
            <input
              type="time"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
              value={closeTime}
              disabled={disabled}
              onChange={(event) => setCloseTime(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="self-end rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            disabled={disabled || selectedDays.length === 0}
            onClick={handleApply}
          >
            Apply
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allDaysSelected}
              disabled={disabled}
              onChange={(event) => setSelectedDays(event.target.checked ? ALL_DAY_KEYS : [])}
            />
            All days
          </label>
          {STOREFRONT_BUSINESS_DAY_OPTIONS.map((day) => {
            const checked = selectedDays.includes(day.key);
            return (
              <label
                key={`business-day-select-${day.key}`}
                className={`select-none rounded-md border px-2 py-1.5 text-xs font-semibold ${checked ? 'border-slate-900 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-500'}`}
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
                onMouseUp={() => setDragState(null)}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => setDaySelected(day.key, event.target.checked)}
                />
                {day.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2" aria-label="Weekly business hours grid">
        {STOREFRONT_BUSINESS_DAY_OPTIONS.map((day) => {
          const dayHours = hours.weekly[day.key];
          const blockStyle = getBlockStyle(dayHours);
          return (
            <div key={`business-grid-${day.key}`} className="grid grid-cols-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-2 sm:grid-cols-[48px_minmax(120px,1fr)_96px_96px_auto]">
              <span className="text-xs font-semibold text-slate-700">{day.label}</span>
              <div className="relative h-8 overflow-hidden rounded-md border border-slate-200 bg-slate-50" aria-label={`${day.label} schedule block`}>
                <div className="absolute inset-y-0 left-1/2 border-l border-slate-200" />
                {blockStyle ? (
                  <div
                    className="absolute top-1 bottom-1 rounded bg-sky-600"
                    style={blockStyle}
                    title={dayHours.open === dayHours.close ? 'Open 24 hours' : `${dayHours.open}-${dayHours.close}`}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] font-semibold text-slate-400">Closed</div>
                )}
              </div>
              <input
                type="time"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                value={dayHours.open}
                disabled={disabled || !dayHours.enabled}
                onChange={(event) => handleGridDayPatch(day.key, { open: event.target.value })}
              />
              <input
                type="time"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                value={dayHours.close}
                disabled={disabled || !dayHours.enabled}
                onChange={(event) => handleGridDayPatch(day.key, { close: event.target.value })}
              />
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={dayHours.enabled}
                disabled={disabled}
                onChange={(event) => handleGridDayPatch(day.key, { enabled: event.target.checked })}
                aria-label={`${day.label} open`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
