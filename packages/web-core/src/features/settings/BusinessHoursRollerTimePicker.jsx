import React, { useEffect, useId, useRef } from 'react';

const HOUR_VALUES = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const MINUTE_VALUES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const PERIOD_VALUES = ['AM', 'PM'];
const PICKER_COLUMNS = [
  { key: 'hour', title: 'Hour', values: HOUR_VALUES },
  { key: 'minute', title: 'Minute', values: MINUTE_VALUES },
  { key: 'period', title: 'AM/PM', values: PERIOD_VALUES }
];
const ROW_HEIGHT = 36;
const VIEWPORT_HEIGHT = 160;
const VIEWPORT_PADDING = (VIEWPORT_HEIGHT - ROW_HEIGHT) / 2;

function parseTime(value) {
  const [hourValue, minuteValue] = String(value || '10:00').split(':');
  const hour24 = Number.parseInt(hourValue, 10);
  const minute = Number.parseInt(minuteValue, 10);
  const safeHour = Number.isInteger(hour24) && hour24 >= 0 && hour24 <= 23 ? hour24 : 10;
  const safeMinute = Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0;

  return {
    hour: String(safeHour % 12 || 12).padStart(2, '0'),
    minute: String(safeMinute).padStart(2, '0'),
    period: safeHour >= 12 ? 'PM' : 'AM'
  };
}

function formatTime(value) {
  const time = parseTime(value);
  return `${time.hour}:${time.minute} ${time.period}`;
}

function to24HourValue(time) {
  const hour12 = Number.parseInt(time.hour, 10);
  const hour24 = (hour12 % 12) + (time.period === 'PM' ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${time.minute}`;
}

function getSelectedIndex(column, time) {
  if (column === 'hour') return HOUR_VALUES.indexOf(time.hour);
  if (column === 'minute') return MINUTE_VALUES.indexOf(time.minute);
  return PERIOD_VALUES.indexOf(time.period);
}

export default function BusinessHoursRollerTimePicker({
  label,
  value,
  disabled = false,
  open = false,
  onOpenChange = () => {},
  onChange
}) {
  const id = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const wheelRefs = useRef({});
  const time = parseTime(value);
  const timeRef = useRef(time);

  useEffect(() => {
    timeRef.current = parseTime(value);
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    PICKER_COLUMNS.forEach(({ key }) => {
      const wheel = wheelRefs.current[key];
      if (wheel) wheel.scrollTop = Math.max(0, getSelectedIndex(key, timeRef.current)) * ROW_HEIGHT;
    });
    wheelRefs.current.hour?.focus();
  }, [open]);

  const updateColumn = (column, nextValue) => {
    const nextTime = { ...time, [column]: nextValue };
    onChange(to24HourValue(nextTime));
  };

  const selectColumnIndex = (column, index) => {
    const values = column === 'hour' ? HOUR_VALUES : column === 'minute' ? MINUTE_VALUES : PERIOD_VALUES;
    const boundedIndex = Math.max(0, Math.min(values.length - 1, index));
    updateColumn(column, values[boundedIndex]);
    const wheel = wheelRefs.current[column];
    if (wheel) {
      wheel.scrollTop = boundedIndex * ROW_HEIGHT;
      wheel.focus();
    }
  };

  const handleWheelKeyDown = (event, column) => {
    const selectedIndex = getSelectedIndex(column, time);
    let nextIndex = selectedIndex;
    if (event.key === 'ArrowUp') nextIndex -= 1;
    else if (event.key === 'ArrowDown') nextIndex += 1;
    else if (event.key === 'PageUp') nextIndex -= 5;
    else if (event.key === 'PageDown') nextIndex += 5;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = (column === 'hour' ? HOUR_VALUES : column === 'minute' ? MINUTE_VALUES : PERIOD_VALUES).length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      triggerRef.current?.focus();
      return;
    } else return;

    event.preventDefault();
    selectColumnIndex(column, nextIndex);
  };

  const closePicker = () => {
    onOpenChange(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-full">
      <span className="mb-1 block text-[12px] font-semibold text-slate-600 sm:mb-1.5">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${formatTime(value)}`}
        aria-expanded={open}
        aria-controls={`${id}-picker`}
        disabled={disabled}
        onClick={() => onOpenChange(true)}
        className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-[13px] font-medium text-slate-900 shadow-sm outline-none transition hover:border-blue-200 focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:h-10 sm:rounded-lg"
      >
        <svg data-testid="roller-clock-icon" viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="min-w-0 flex-1">{formatTime(value)}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div id={`${id}-picker`} role="group" aria-label={`${label} roller time picker`} className="absolute left-0 top-full z-40 mt-2 w-full min-w-[13rem] max-w-[calc(100vw-2rem)] rounded-lg border border-blue-100 bg-white p-3 shadow-lg shadow-slate-900/10">
          <div className="grid grid-cols-[0.9fr_1fr_0.8fr] gap-2 text-center text-[10px] font-semibold text-slate-500">
            {PICKER_COLUMNS.map((column) => <span key={column.key}>{column.title}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-[0.9fr_1fr_0.8fr] gap-2">
            {PICKER_COLUMNS.map((column) => {
              const selectedIndex = getSelectedIndex(column.key, time);
              const selectedValue = column.values[selectedIndex];
              return (
                <div key={column.key} className="relative min-w-0">
                  <div
                    ref={(node) => { wheelRefs.current[column.key] = node; }}
                    role="listbox"
                    aria-label={`${label} ${column.title.toLowerCase()}`}
                    aria-activedescendant={`${id}-${column.key}-${selectedValue}`}
                    tabIndex={0}
                    data-picker-column={column.key}
                    onKeyDown={(event) => handleWheelKeyDown(event, column.key)}
                    onScroll={(event) => {
                      const nextIndex = Math.max(0, Math.min(column.values.length - 1, Math.round(event.currentTarget.scrollTop / ROW_HEIGHT)));
                      const nextValue = column.values[nextIndex];
                      if (nextValue !== selectedValue) updateColumn(column.key, nextValue);
                    }}
                    className="relative overflow-y-auto overscroll-contain rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"
                    style={{ height: VIEWPORT_HEIGHT, paddingBlock: VIEWPORT_PADDING, scrollSnapType: 'y mandatory', scrollbarWidth: 'thin' }}
                  >
                    {column.values.map((option) => (
                      <button
                        key={option}
                        id={`${id}-${column.key}-${option}`}
                        type="button"
                        role="option"
                        aria-selected={option === selectedValue}
                        tabIndex={-1}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          updateColumn(column.key, option);
                          const wheel = event.currentTarget.closest('[role="listbox"]');
                          if (wheel) {
                            wheel.scrollTop = column.values.indexOf(option) * ROW_HEIGHT;
                            wheel.focus();
                          }
                        }}
                        className={`flex w-full items-center justify-center rounded-md text-[13px] font-semibold transition-colors ${option === selectedValue ? 'text-[#1A4E8D]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
                        style={{ height: ROW_HEIGHT, scrollSnapAlign: 'center' }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-9 -translate-y-1/2 rounded-md border border-blue-100 bg-blue-50/45" />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={closePicker} className="min-h-9 rounded-md px-3 text-[12px] font-bold text-[#1A4E8D] transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]">Done</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
