import React, { useMemo, useRef, useState } from 'react';
import {
  STOREFRONT_BUSINESS_DAY_OPTIONS,
  addStorefrontBusinessHoursInterval,
  applyStorefrontBusinessHoursRange,
  createDefaultStorefrontBusinessHours,
  formatStorefrontBusinessHoursDisplay,
  getStorefrontBusinessHoursDayIssues,
  isStorefrontBusinessHoursAlwaysOpen,
  moveStorefrontBusinessHoursInterval,
  normalizeStorefrontBusinessHours,
  removeStorefrontBusinessHoursInterval,
  updateStorefrontBusinessHoursInterval,
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

const getBlockStyles = (dayHours = {}) => {
  if (!dayHours.enabled) return null;
  const intervals = Array.isArray(dayHours.intervals) ? dayHours.intervals : [];
  const blocks = intervals.flatMap((interval) => {
    if (interval.open === interval.close) {
      return [{ left: '0%', width: '100%', title: 'Open 24 hours' }];
    }
    const openMinutes = timeToMinutes(interval.open);
    const closeMinutes = timeToMinutes(interval.close);
    if (openMinutes == null || closeMinutes == null) return [];
    const ranges = closeMinutes > openMinutes
      ? [[openMinutes, closeMinutes]]
      : [[openMinutes, 1440], [0, closeMinutes]];
    return ranges.map(([start, end]) => ({
      left: `${(start / 1440) * 100}%`,
      width: `${Math.max(4, ((end - start) / 1440) * 100)}%`,
      title: `${interval.open}-${interval.close}`
    }));
  });
  return blocks.length > 0 ? blocks : null;
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
    const currentDay = hours.weekly[dayKey];
    const intervals = currentDay.intervals || [{ open: currentDay.open, close: currentDay.close }];
    emit({
      ...hours,
      weekly: {
        ...hours.weekly,
        [dayKey]: {
          ...currentDay,
          ...patch,
          intervals,
          open: intervals[0]?.open || '09:00',
          close: intervals[0]?.close || '18:00'
        }
      }
    });
  };

  const handleIntervalPatch = (dayKey, index, patch) => {
    emit(updateStorefrontBusinessHoursInterval(hours, dayKey, index, patch));
  };

  const handleAddInterval = (dayKey) => {
    emit(addStorefrontBusinessHoursInterval(hours, dayKey));
  };

  const handleRemoveInterval = (dayKey, index) => {
    emit(removeStorefrontBusinessHoursInterval(hours, dayKey, index));
  };

  const handleMoveInterval = (dayKey, index, direction) => {
    emit(moveStorefrontBusinessHoursInterval(hours, dayKey, index, direction));
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
              <button
                type="button"
                key={`business-day-select-${day.key}`}
                className={`select-none rounded-md border px-2 py-1.5 text-xs font-semibold ${checked ? 'border-slate-900 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-500'}`}
                disabled={disabled}
                aria-pressed={checked}
                aria-label={`Select ${day.label} for bulk business hours`}
                onClick={() => setDaySelected(day.key, !checked)}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2" aria-label="Weekly business hours grid">
        {STOREFRONT_BUSINESS_DAY_OPTIONS.map((day) => {
          const dayHours = hours.weekly[day.key];
          const blockStyles = getBlockStyles(dayHours);
          const dayIssues = getStorefrontBusinessHoursDayIssues(dayHours);
          return (
            <div key={`business-grid-${day.key}`} className="grid grid-cols-1 items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-2 sm:grid-cols-[48px_minmax(120px,1fr)_minmax(220px,1.4fr)_auto]">
              <span className="text-xs font-semibold text-slate-700">{day.label}</span>
              <div className="relative h-8 overflow-hidden rounded-md border border-slate-200 bg-slate-50" aria-label={`${day.label} schedule block`}>
                <div className="absolute inset-y-0 left-1/2 border-l border-slate-200" />
                {blockStyles ? (
                  blockStyles.map((blockStyle, index) => (
                    <div
                      key={`${day.key}-block-${index}`}
                      className="absolute top-1 bottom-1 rounded bg-sky-600"
                      style={{ left: blockStyle.left, width: blockStyle.width }}
                      title={blockStyle.title}
                    />
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] font-semibold text-slate-400">Closed</div>
                )}
              </div>
              <div className="min-w-0 space-y-2">
                {(dayHours.intervals || []).map((interval, index) => (
                  <div key={`${day.key}-interval-${index}`} className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-1">
                    <input
                      type="time"
                      className="min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                      value={interval.open}
                      disabled={disabled || !dayHours.enabled}
                      aria-label={`${day.label} interval ${index + 1} open time`}
                      onChange={(event) => handleIntervalPatch(day.key, index, { open: event.target.value })}
                    />
                    <input
                      type="time"
                      className="min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                      value={interval.close}
                      disabled={disabled || !dayHours.enabled}
                      aria-label={`${day.label} interval ${index + 1} close time`}
                      onChange={(event) => handleIntervalPatch(day.key, index, { close: event.target.value })}
                    />
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
                      disabled={disabled || !dayHours.enabled || index === 0}
                      onClick={() => handleMoveInterval(day.key, index, 'up')}
                      aria-label={`Move ${day.label} interval ${index + 1} up`}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
                      disabled={disabled || !dayHours.enabled || index === dayHours.intervals.length - 1}
                      onClick={() => handleMoveInterval(day.key, index, 'down')}
                      aria-label={`Move ${day.label} interval ${index + 1} down`}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-40"
                      disabled={disabled || !dayHours.enabled || dayHours.intervals.length <= 1}
                      onClick={() => handleRemoveInterval(day.key, index)}
                      aria-label={`Remove ${day.label} interval ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    disabled={disabled || !dayHours.enabled}
                    onClick={() => handleAddInterval(day.key)}
                  >
                    Add interval
                  </button>
                  {dayIssues.length > 0 ? (
                    <span className="text-[11px] font-medium text-red-600">{dayIssues[0]}</span>
                  ) : null}
                </div>
              </div>
              <label className="flex items-center justify-end gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={dayHours.enabled}
                  disabled={disabled}
                  onChange={(event) => handleGridDayPatch(day.key, { enabled: event.target.checked })}
                  aria-label={`${day.label} open`}
                />
                Open
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
