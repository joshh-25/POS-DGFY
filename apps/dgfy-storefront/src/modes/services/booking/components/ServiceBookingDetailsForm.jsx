import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import { formatTimeSlotLabel } from '../model/serviceBookingSchedule.js';

const padCalendarPart = (value) => String(value).padStart(2, '0');

const getCalendarMonthLabels = (year) => Array.from(
  { length: 12 },
  (_, index) => new Date(Date.UTC(year, index, 1)).toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' })
);

const getCalendarWeekdayLabels = () => {
  const today = new Date();
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  return Array.from(
    { length: 7 },
    (_, index) => new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + index).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1)
  );
};

const parseCalendarDateValue = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
};

const formatCalendarDateValue = (date) => `${date.getUTCFullYear()}-${padCalendarPart(date.getUTCMonth() + 1)}-${padCalendarPart(date.getUTCDate())}`;

const getCalendarMonthValue = (dateValue) => {
  const date = parseCalendarDateValue(dateValue);
  return date ? `${date.getUTCFullYear()}-${padCalendarPart(date.getUTCMonth() + 1)}-01` : '';
};

const getCalendarMonthParts = (monthValue) => {
  const date = parseCalendarDateValue(monthValue) || new Date();
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
};

const getCalendarMonthCells = (monthValue) => {
  const { year, monthIndex } = getCalendarMonthParts(monthValue);
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Array.from({ length: firstDay + daysInMonth }, (_, index) => {
    if (index < firstDay) return null;
    return formatCalendarDateValue(new Date(Date.UTC(year, monthIndex, index - firstDay + 1)));
  });
};

const getAdjacentCalendarMonthValue = (monthValue, direction) => {
  const date = parseCalendarDateValue(monthValue) || new Date();
  date.setUTCMonth(date.getUTCMonth() + direction);
  return `${date.getUTCFullYear()}-${padCalendarPart(date.getUTCMonth() + 1)}-01`;
};

const getCalendarMonthValueForYear = (year, monthIndex, minimumMonthValue) => {
  const monthValue = `${year}-${padCalendarPart(monthIndex + 1)}-01`;
  return monthValue >= minimumMonthValue ? monthValue : '';
};

const getQuickDateOptions = (bookingDateOptions) => [
  { key: 'today', label: 'Today', offset: 0 },
  { key: 'tomorrow', label: 'Tomorrow', offset: 1 },
  { key: 'in-two-days', label: 'In 2 days', offset: 2 },
  { key: 'next-week', label: 'Next week', offset: 7, minimumOffset: 7 },
].map((preset) => ({
  ...preset,
  option: preset.minimumOffset
    ? bookingDateOptions.find((option) => Number(option.offset) >= preset.minimumOffset) || null
    : bookingDateOptions.find((option) => Number(option.offset) === preset.offset) || null,
}));

const formatShortDateWithYear = (dateString) => {
  if (!dateString) return '';
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const SCHEDULE_PICKER_CSS = `
@keyframes servicesScheduleBackdropIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes servicesScheduleDialogIn {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes servicesSchedulePanelIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.services-schedule-backdrop { animation: servicesScheduleBackdropIn 160ms ease-out both; }
.services-schedule-dialog { animation: servicesScheduleDialogIn 180ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.services-schedule-panel { animation: servicesSchedulePanelIn 140ms ease-out both; }
.services-schedule-icon-button,
.services-schedule-arrow,
.services-schedule-quick-choice,
.services-schedule-date,
.services-schedule-time-option { transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease, border-color 140ms ease, color 140ms ease; }
.services-schedule-icon-button:hover:not(:disabled),
.services-schedule-arrow:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08); }
.services-schedule-quick-choice:hover:not(:disabled),
.services-schedule-time-option:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(15, 118, 110, 0.12); }
.services-schedule-date:hover:not(:disabled) { transform: scale(1.08); box-shadow: 0 3px 8px rgba(15, 118, 110, 0.16); }
.services-schedule-time-popup { animation: servicesSchedulePanelIn 150ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .services-schedule-backdrop,
  .services-schedule-dialog,
  .services-schedule-panel,
  .services-schedule-time-popup { animation: none; transition: none !important; }
  .services-schedule-icon-button,
  .services-schedule-arrow,
  .services-schedule-quick-choice,
  .services-schedule-date,
  .services-schedule-time-option { transition: none; }
}
`;

function ScheduleOptionCard({ active, icon, label, description, onClick, buttonRef, servicesPrimary, servicesPrimaryShadow }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      aria-pressed={active}
      onClick={onClick}
      style={{
        minHeight: 74,
        width: '100%',
        borderRadius: 14,
        border: `1.5px solid ${active ? servicesPrimary : '#dbe5ee'}`,
        background: active ? '#e8f4ff' : '#fff',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: active ? `0 8px 20px ${servicesPrimaryShadow}` : 'none',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: active ? '#dff3f8' : '#f8fafc', display: 'grid', placeItems: 'center', color: active ? servicesPrimary : '#1e293b', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: '1 1 0%', minWidth: 0, display: 'grid', gap: 3 }}>
        <span style={{ color: active ? '#1e293b' : '#334155', fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{label}</span>
        <span style={{ color: '#64748b', fontSize: 12, lineHeight: 1.35 }}>{description}</span>
      </div>
      <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${active ? servicesPrimary : '#dbe5ee'}`, background: active ? servicesPrimary : '#fff', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {active ? <CheckCircle2 size={14} strokeWidth={3} /> : null}
      </div>
    </button>
  );
}

export function ServiceBookingDetailsForm({
  STYLES,
  BOOKING_FIELD_STYLE,
  StorefrontDropdown,
  registerBookingFieldRef,
  shouldBookingFieldSpanFullWidth,
  combineDateAndTimeParts,
  getPreferredBookingTimeForDate,
  activeBookingService,
  isMobileViewport,
  bookingFieldPlan,
  selectedServiceDatePart,
  bookingCalendarDateOptions = [],
  bookingDateOptions,
  bookingPreferredDateInputRef,
  selectedServiceTimePart,
  serviceScheduleMode = 'now',
  bookingTimeSlotOptions,
  setServiceScheduleMode = () => {},
  setServiceAppointmentAt,
  serviceUnitType,
  setServiceUnitType,
  bookingStepOneAdditionalFields,
  serviceIntakeResponses,
  setServiceIntakeResponses,
  servicesPrimary,
  servicesPrimarySoft = '#ecfeff',
  servicesPrimaryBorder,
  servicesPrimaryShadow,
}) {
  const compactFieldMinHeight = isMobileViewport ? 40 : 42;
  const compactFieldPadding = isMobileViewport ? '9px 40px 9px 11px' : '10px 42px 10px 12px';
  const extraFields = bookingStepOneAdditionalFields.filter(field => field.id !== 'special_instructions' && field.id !== 'instructions');
  const recommendedDate = bookingDateOptions.find((option) => option.recommended) || null;
  const calendarDateOptions = bookingCalendarDateOptions.length > 0 ? bookingCalendarDateOptions : bookingDateOptions;
  const [isSchedulePickerOpen, setIsSchedulePickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [isTimeSelectionCommitted, setIsTimeSelectionCommitted] = useState(false);
  const initialCalendarMonth = getCalendarMonthValue(selectedServiceDatePart || calendarDateOptions[0]?.value) || getCalendarMonthValue(formatCalendarDateValue(new Date()));
  const [calendarMonthValue, setCalendarMonthValue] = useState(initialCalendarMonth);
  const [calendarPanel, setCalendarPanel] = useState('calendar');
  const resolvedScheduleMode = serviceScheduleMode === 'later' ? 'later' : 'now';
  const recommendedSlotLabel = recommendedDate
    ? `${recommendedDate.label}, ${formatTimeSlotLabel(recommendedDate.recommendedTime)}`
    : 'No available slot is currently suggested';
  const dateOptionsByValue = new Map(calendarDateOptions.map((option) => [option.value, option]));
  const calendarStartDateValue = calendarDateOptions[0]?.value || formatCalendarDateValue(new Date());
  const calendarMinimumMonthValue = getCalendarMonthValue(calendarStartDateValue) || getCalendarMonthValue(formatCalendarDateValue(new Date()));
  const calendarMinimumYear = getCalendarMonthParts(calendarMinimumMonthValue).year;
  const [yearListEnd, setYearListEnd] = useState(calendarMinimumYear + 10);
  const getCalendarDateOption = (dateValue) => {
    const existingOption = dateOptionsByValue.get(dateValue);
    if (existingOption) return existingOption;
    if (!calendarStartDateValue || dateValue < calendarStartDateValue) return null;
    return {
      value: dateValue,
      label: formatShortDateWithYear(dateValue),
      hasAvailability: false,
      recommended: false,
      recommendedTime: ''
    };
  };
  const calendarMonthParts = getCalendarMonthParts(calendarMonthValue);
  const calendarYearOptions = Array.from(
    { length: Math.max(1, Math.max(yearListEnd, calendarMonthParts.year + 5) - calendarMinimumYear + 1) },
    (_, index) => calendarMinimumYear + index
  );
  const calendarMonthLabels = getCalendarMonthLabels(calendarMonthParts.year);
  const calendarWeekdayLabels = getCalendarWeekdayLabels();
  const calendarMonthLabel = calendarMonthLabels[calendarMonthParts.monthIndex];
  const calendarMonthCells = getCalendarMonthCells(calendarMonthValue);
  const quickDateOptions = getQuickDateOptions(calendarDateOptions);
  const calendarSelectableStartDateValue = calendarStartDateValue;

  useEffect(() => {
    if (!isSchedulePickerOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsSchedulePickerOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isSchedulePickerOpen]);

  const selectNow = () => {
    setServiceScheduleMode('now');
    setIsSchedulePickerOpen(false);
    const firstDate = bookingDateOptions[0]?.value || '';
    if (!firstDate) {
      setServiceAppointmentAt('');
      return;
    }
    const nextTime = getPreferredBookingTimeForDate(activeBookingService, firstDate, '');
    setServiceAppointmentAt(combineDateAndTimeParts(firstDate, nextTime));
  };

  const openSchedulePicker = () => {
    setServiceScheduleMode('later');
    setServiceAppointmentAt(selectedServiceDatePart || '');
    setCalendarMonthValue(initialCalendarMonth);
    setCalendarPanel('calendar');
    setIsTimeDropdownOpen(false);
    setIsTimeSelectionCommitted(false);
    setIsTimePickerOpen(false);
    setIsSchedulePickerOpen(true);
  };

  const selectCalendarYear = (year) => {
    const nextMonthValue = getCalendarMonthValueForYear(year, calendarMonthParts.monthIndex, calendarMinimumMonthValue);
    if (!nextMonthValue) return;
    setCalendarMonthValue(nextMonthValue);
    setYearListEnd((currentEnd) => Math.max(currentEnd, year + 5));
    setCalendarPanel('calendar');
  };

  const selectCalendarDate = (nextDate) => {
    const selectedOption = getCalendarDateOption(nextDate);
    if (!selectedOption) return;
    setServiceAppointmentAt(nextDate);
    setCalendarMonthValue(getCalendarMonthValue(nextDate));
    setCalendarPanel('calendar');
    setIsTimeDropdownOpen(false);
    setIsTimeSelectionCommitted(false);
    setIsTimePickerOpen(true);
  };

  const selectedScheduleLabel = selectedServiceDatePart && selectedServiceTimePart
    ? `${formatShortDateWithYear(selectedServiceDatePart)}, ${formatTimeSlotLabel(selectedServiceTimePart)}`
    : 'Choose a date and time';
  const handleTimeSelection = (nextTime) => {
    setServiceAppointmentAt(combineDateAndTimeParts(selectedServiceDatePart, nextTime));
    setIsTimeDropdownOpen(false);
    setIsTimeSelectionCommitted(true);
    setIsTimePickerOpen(true);
  };
  const timeSelector = bookingTimeSlotOptions.length > 0 ? (
    <StorefrontDropdown
      value={selectedServiceTimePart}
      onChange={handleTimeSelection}
      options={bookingTimeSlotOptions.map((slot) => ({ value: slot.value, label: slot.label }))}
      placeholder="Select a time"
      containerStyle={{ zIndex: 3 }}
      onOpenChange={setIsTimeDropdownOpen}
      triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 0, minHeight: compactFieldMinHeight, padding: isMobileViewport ? '9px 40px 9px 11px' : '10px 42px 10px 12px' }}
      menuStyle={{ position: 'static', top: 'auto', left: 'auto', width: '100%', minWidth: 0, marginTop: 6, borderRadius: 14, maxHeight: 'min(150px, 22dvh)', boxShadow: '0 8px 18px rgba(15,23,42,0.08)' }}
    />
  ) : (
    <div style={{ border: '1px solid #dbe5ee', borderRadius: 10, padding: '8px 10px', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>No available time slots</div>
  );

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <section ref={registerBookingFieldRef('preferred_date')} style={{ display: 'grid', gap: 12, minWidth: 0 }} aria-labelledby="service-timing-heading">
          <div id="service-timing-heading" style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>2. Service timing</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 16 }}>
            <ScheduleOptionCard
              active={resolvedScheduleMode === 'now'}
              icon={<Clock3 size={20} />}
              label="Now"
              description={recommendedDate ? `Next available: ${recommendedSlotLabel}` : 'Use the next valid available slot.'}
              onClick={selectNow}
              servicesPrimary={servicesPrimary}
              servicesPrimaryShadow={servicesPrimaryShadow}
            />
            <ScheduleOptionCard
              active={resolvedScheduleMode === 'later'}
              icon={<CalendarDays size={20} />}
              label="Schedule for later"
              description={resolvedScheduleMode === 'later' ? selectedScheduleLabel : 'Choose a date and time.'}
              onClick={openSchedulePicker}
              buttonRef={bookingPreferredDateInputRef}
              servicesPrimary={servicesPrimary}
              servicesPrimaryShadow={servicesPrimaryShadow}
            />
          </div>
        </section>

          {bookingFieldPlan.unitTypeField ? (
            <label ref={registerBookingFieldRef('unit_type')} style={{ display: 'grid', gap: 8, fontSize: 12, color: '#475569', minWidth: 0 }}>
              {bookingFieldPlan.unitTypeField.label}{bookingFieldPlan.unitTypeField.required ? ' *' : ''}
              {bookingFieldPlan.unitTypeField.type === 'select' ? (
                <StorefrontDropdown
                  value={serviceUnitType}
                  onChange={setServiceUnitType}
                  options={bookingFieldPlan.unitTypeField.options.map((option) => ({ value: option, label: option }))}
                  placeholder="Select"
                  triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 0, minHeight: compactFieldMinHeight, padding: compactFieldPadding }}
                  menuStyle={{ borderRadius: 18 }}
                />
              ) : (
                <input value={serviceUnitType} onChange={(event) => setServiceUnitType(event.target.value)} placeholder="Specify the unit type" style={{ ...BOOKING_FIELD_STYLE, marginTop: 0, minHeight: compactFieldMinHeight, padding: isMobileViewport ? '9px 11px' : '10px 12px' }} />
              )}
            </label>
          ) : null}
        </div>

        {isSchedulePickerOpen ? (
          <div
            role="presentation"
            className="services-schedule-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsSchedulePickerOpen(false);
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: isMobileViewport ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobileViewport ? 0 : 20, background: 'rgba(15,23,42,0.42)' }}
          >
            <section role="dialog" aria-modal="true" aria-labelledby="service-schedule-dialog-title" className="services-schedule-dialog" style={{ width: 'min(100%, 520px)', maxHeight: isMobileViewport ? 'min(94dvh, 680px)' : 'min(88dvh, 680px)', overflow: 'hidden', borderRadius: isMobileViewport ? '22px 22px 0 0' : 22, background: '#fff', padding: isMobileViewport ? 14 : 16, boxSizing: 'border-box', boxShadow: '0 24px 70px rgba(15,23,42,0.24)', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', gap: 8 }}>
              <style>{SCHEDULE_PICKER_CSS}</style>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <h3 id="service-schedule-dialog-title" style={{ margin: 0, color: '#0f172a', fontSize: 18, fontWeight: 800 }}>Schedule for later</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 12, lineHeight: 1.4 }}>Choose a date and an available handoff time.</p>
                </div>
                <button type="button" aria-label="Close schedule picker" className="services-schedule-icon-button" onClick={() => setIsSchedulePickerOpen(false)} style={{ width: 34, height: 34, border: '1px solid #dbe5ee', borderRadius: 999, background: '#fff', color: '#334155', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ minHeight: 0, overflow: 'hidden', paddingRight: 0, display: 'grid', alignContent: 'start', gap: 8 }}>
                {!isTimePickerOpen ? (
                  <div style={{ display: 'grid', gap: 6, border: '1px solid #e2e8f0', borderRadius: 14, padding: isMobileViewport ? 8 : 10, background: '#fff' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) 32px', alignItems: 'center', gap: 4 }}>
                      <button
                        type="button"
                        aria-label="Previous month"
                        className="services-schedule-arrow"
                        disabled={calendarMonthValue <= calendarMinimumMonthValue}
                        onClick={(event) => {
                          event.stopPropagation();
                          setCalendarMonthValue(getAdjacentCalendarMonthValue(calendarMonthValue, -1));
                        }}
                        style={{ width: 28, height: 28, border: 'none', borderRadius: 999, background: '#f8fafc', color: servicesPrimary, display: 'grid', placeItems: 'center', cursor: calendarMonthValue > calendarMinimumMonthValue ? 'pointer' : 'not-allowed', opacity: calendarMonthValue > calendarMinimumMonthValue ? 1 : 0.35 }}
                      >
                        <ChevronLeft size={18} />
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
                        <button
                          type="button"
                          aria-label="Select month"
                          onClick={(event) => {
                            event.stopPropagation();
                            setCalendarPanel(calendarPanel === 'month' ? 'calendar' : 'month');
                          }}
                          style={{ border: 'none', background: 'transparent', color: '#0f172a', padding: '2px 1px', fontSize: 15, fontWeight: 900, cursor: 'pointer' }}
                        >
                          {calendarMonthLabel}
                        </button>
                        <button
                          type="button"
                          aria-label="Select year"
                          onClick={(event) => {
                            event.stopPropagation();
                            setCalendarPanel(calendarPanel === 'year' ? 'calendar' : 'year');
                          }}
                          aria-expanded={calendarPanel === 'year'}
                          style={{ border: 'none', background: 'transparent', color: '#475569', padding: '2px 1px', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}
                        >
                          {calendarMonthParts.year}
                        </button>
                      </div>

                      <button
                        type="button"
                        aria-label="Next month"
                        className="services-schedule-arrow"
                        onClick={(event) => {
                          event.stopPropagation();
                          setCalendarMonthValue(getAdjacentCalendarMonthValue(calendarMonthValue, 1));
                        }}
                        style={{ width: 28, height: 28, border: 'none', borderRadius: 999, background: '#f8fafc', color: servicesPrimary, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                      >
                        <ChevronRight size={18} />
                      </button>
                  </div>

                  {calendarPanel === 'month' ? (
                    <div key="month-panel" className="services-schedule-panel" style={{ display: 'grid', gap: 6 }}>
                      <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800, textAlign: 'center' }}>Select month</div>
                      <div role="listbox" aria-label="Select month" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                      {calendarMonthLabels.map((month, monthIndex) => {
                        const monthValue = `${calendarMonthParts.year}-${padCalendarPart(monthIndex + 1)}-01`;
                        const isAvailable = monthValue >= calendarMinimumMonthValue;
                        const isSelected = monthIndex === calendarMonthParts.monthIndex;
                        return (
                          <button
                            key={month}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            disabled={!isAvailable}
                            onClick={() => {
                              setCalendarMonthValue(monthValue);
                              setCalendarPanel('calendar');
                            }}
                            style={{ minHeight: 38, border: `1px solid ${isSelected ? servicesPrimary : '#e2e8f0'}`, borderRadius: 10, background: isSelected ? servicesPrimarySoft : '#fff', color: isAvailable ? '#0f172a' : '#cbd5e1', fontSize: 12, fontWeight: isSelected ? 900 : 700, cursor: isAvailable ? 'pointer' : 'not-allowed' }}
                          >
                            {month.slice(0, 3)}
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  ) : calendarPanel === 'year' ? (
                    <div key="year-panel" className="services-schedule-panel" style={{ display: 'grid', gap: 6 }}>
                      <div style={{ color: '#64748b', fontSize: 10, fontWeight: 800, textAlign: 'center' }}>Select year</div>
                      <div role="listbox" aria-label="Select year" onScroll={(event) => {
                        const target = event.currentTarget;
                        if (target.scrollTop + target.clientHeight >= target.scrollHeight - 16) {
                          setYearListEnd((currentEnd) => currentEnd + 10);
                        }
                      }} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, maxHeight: 176, overflowY: 'auto', overscrollBehavior: 'contain', paddingRight: 2 }}>
                      {calendarYearOptions.map((year) => {
                        const isSelected = year === calendarMonthParts.year;
                        return (
                          <button
                            key={year}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              selectCalendarYear(year);
                            }}
                            style={{ minHeight: 30, border: `1px solid ${isSelected ? servicesPrimary : '#e2e8f0'}`, borderRadius: 9, background: isSelected ? servicesPrimarySoft : '#fff', color: '#0f172a', fontSize: 11, fontWeight: isSelected ? 900 : 700, cursor: 'pointer' }}
                          >
                            {year}
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  ) : (
                    <div key="calendar-panel" className="services-schedule-panel" style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4 }}>
                        {quickDateOptions.map(({ key, label, option }) => {
                          const isSelected = option?.value === selectedServiceDatePart;
                          return (
                            <button
                            key={key}
                            type="button"
                              className="services-schedule-quick-choice"
                              disabled={!option}
                              onClick={() => option && selectCalendarDate(option.value)}
                              style={{ minHeight: 28, border: `1px solid ${isSelected ? servicesPrimary : '#e2e8f0'}`, borderRadius: 8, background: isSelected ? servicesPrimarySoft : '#fff', color: option ? '#334155' : '#cbd5e1', padding: '3px 2px', fontSize: 10, fontWeight: isSelected ? 900 : 700, cursor: option ? 'pointer' : 'not-allowed' }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, color: '#94a3b8', fontSize: 9, fontWeight: 800, textAlign: 'center' }}>
                        {calendarWeekdayLabels.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
                      </div>
                      <div role="grid" aria-label={`${calendarMonthLabel} ${calendarMonthParts.year}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1 }}>
                        {calendarMonthCells.map((dateValue, index) => {
                          if (!dateValue) return <span key={`empty-${index}`} aria-hidden="true" style={{ minHeight: isMobileViewport ? 22 : 24 }} />;
                          const dateOption = getCalendarDateOption(dateValue);
                          const isSelected = dateValue === selectedServiceDatePart;
                          const isRecommended = Boolean(dateOption?.recommended);
                          const hasAvailability = dateOption?.hasAvailability !== false;
                          const isPastDate = dateValue < calendarSelectableStartDateValue;
                          const isDateSelectable = Boolean(dateOption) && !isPastDate;
                          return (
                            <button
                              key={dateValue}
                              type="button"
                              className="services-schedule-date"
                              role="gridcell"
                              aria-label={dateOption ? `${dateOption.label}${hasAvailability ? '' : ', no available time slots'}${isRecommended ? ', recommended' : ''}` : dateValue}
                              aria-selected={isSelected}
                              disabled={!isDateSelectable}
                              onClick={() => selectCalendarDate(dateValue)}
                              style={{ minHeight: isMobileViewport ? 22 : 24, border: `1px solid ${isSelected ? servicesPrimary : isRecommended ? servicesPrimaryBorder : 'transparent'}`, borderRadius: 999, background: isSelected ? servicesPrimary : isRecommended ? servicesPrimarySoft : 'transparent', color: dateOption ? (isSelected ? '#fff' : isPastDate ? '#94a3b8' : '#334155') : '#cbd5e1', fontSize: 10, fontWeight: isSelected || isRecommended ? 900 : 600, cursor: isDateSelectable ? 'pointer' : 'not-allowed' }}
                            >
                              {parseCalendarDateValue(dateValue).getUTCDate()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  </div>
                ) : (
                  <div role="dialog" aria-modal="false" aria-labelledby="service-time-dialog-title" data-time-dropdown-open={isTimeDropdownOpen ? 'true' : 'false'} className="services-schedule-time-popup" style={{ position: 'relative', zIndex: 2, display: 'grid', gap: 10, height: isTimeDropdownOpen ? (isMobileViewport ? 460 : 480) : isTimeSelectionCommitted ? (isMobileViewport ? 300 : 315) : (isMobileViewport ? 300 : 320), overflow: 'hidden', boxSizing: 'border-box', border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 14, padding: isMobileViewport ? 12 : 14, background: '#fff', boxShadow: '0 12px 30px rgba(15,23,42,0.08)', transition: 'height 240ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 240ms ease', willChange: 'height' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button type="button" aria-label="Back to date selection" onClick={() => { setIsTimeDropdownOpen(false); setIsTimeSelectionCommitted(false); setIsTimePickerOpen(false); }} style={{ width: 30, height: 30, border: '1px solid #dbe5ee', borderRadius: 999, background: '#fff', color: '#334155', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <ChevronLeft size={17} />
                      </button>
                      <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                        <h4 id="service-time-dialog-title" style={{ margin: 0, color: '#0f172a', fontSize: 15, fontWeight: 800 }}>{isTimeSelectionCommitted ? 'Schedule selected' : 'Choose a time'}</h4>
                        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600 }}>{isTimeSelectionCommitted ? 'Review the selected date and time before confirming.' : `Select an available handoff time for ${formatShortDateWithYear(selectedServiceDatePart)}`}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 4, color: '#334155', fontSize: 12, fontWeight: 700 }}>
                      <span>{isTimeSelectionCommitted ? 'Handoff time' : 'Available handoff time'}</span>
                      {timeSelector}
                    </div>

                    {isTimeSelectionCommitted ? (
                      <div role="status" aria-live="polite" style={{ display: 'grid', gap: 9, borderRadius: 14, border: `1px solid ${servicesPrimaryBorder}`, background: `linear-gradient(135deg, ${servicesPrimarySoft}, #ffffff)`, padding: '10px 11px', color: servicesPrimary, fontSize: 11, lineHeight: 1.25, boxShadow: '0 8px 18px rgba(15,118,110,0.08)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 24, height: 24, borderRadius: 999, background: servicesPrimary, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <CheckCircle2 size={14} strokeWidth={3} />
                          </span>
                          <div style={{ display: 'grid', gap: 1, minWidth: 0 }}>
                            <strong style={{ fontSize: 12 }}>Selected handoff</strong>
                            <span style={{ color: '#47716f', fontSize: 10, fontWeight: 700 }}>Ready to confirm</span>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, border: '1px solid rgba(153,246,228,0.85)', borderRadius: 10, background: 'rgba(255,255,255,0.72)', padding: '7px 8px' }}>
                            <CalendarDays size={15} strokeWidth={2.4} />
                            <div style={{ display: 'grid', gap: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 9, fontWeight: 800, color: '#47716f', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</span>
                              <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatShortDateWithYear(selectedServiceDatePart)}</strong>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, border: '1px solid rgba(153,246,228,0.85)', borderRadius: 10, background: 'rgba(255,255,255,0.72)', padding: '7px 8px' }}>
                            <Clock3 size={15} strokeWidth={2.4} />
                            <div style={{ display: 'grid', gap: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 9, fontWeight: 800, color: '#47716f', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</span>
                              <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatTimeSlotLabel(selectedServiceTimePart)}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {!isTimeSelectionCommitted ? (
                      <div style={{ borderRadius: 10, border: `1px solid ${servicesPrimaryBorder}`, background: '#ecfeff', padding: '8px 10px', color: servicesPrimary, fontSize: 11, lineHeight: 1.35 }}>
                        <strong>Suggested next slot</strong><br />
                        {recommendedSlotLabel}
                      </div>
                    ) : null}

                    <button type="button" aria-label="Back to date selection" onClick={() => { setIsTimeDropdownOpen(false); setIsTimeSelectionCommitted(false); setIsTimePickerOpen(false); }} style={{ minHeight: 34, border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 10, background: '#f8fafc', color: '#334155', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={15} />Change date</button>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 8, paddingTop: 8, borderTop: '1px solid #eef2f7' }}>
                <button type="button" onClick={() => setIsSchedulePickerOpen(false)} style={{ minHeight: 38, border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 10, background: '#fff', color: '#334155', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
                <button type="button" disabled={!selectedServiceDatePart || !selectedServiceTimePart} onClick={() => setIsSchedulePickerOpen(false)} style={{ minHeight: 38, border: 'none', borderRadius: 10, background: selectedServiceDatePart && selectedServiceTimePart ? servicesPrimary : '#cbd5e1', color: '#fff', fontWeight: 800, cursor: selectedServiceDatePart && selectedServiceTimePart ? 'pointer' : 'not-allowed' }}>Use this schedule</button>
              </div>
            </section>
          </div>
        ) : null}

        {extraFields.length > 0 && (
          <section style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Additional Service Details</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Only fill in the extra details required for this service.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>
              {extraFields.map((field) => (
                <label
                  ref={registerBookingFieldRef(`intake_${field.id}`)}
                  key={`booking-step-one-${field.id}`}
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: '#475569',
                    minWidth: 0,
                    gridColumn: !isMobileViewport && shouldBookingFieldSpanFullWidth(field) ? '1 / -1' : 'auto',
                  }}
                >
                  {field.label}{field.required ? ' *' : ''}
                  {field.type === 'textarea' ? (
                    <textarea value={serviceIntakeResponses[field.id] || ''} onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))} style={{ ...BOOKING_FIELD_STYLE, minHeight: 84, resize: 'vertical', padding: isMobileViewport ? '10px 11px' : '11px 12px' }} />
                  ) : field.type === 'select' ? (
                    <StorefrontDropdown
                      value={serviceIntakeResponses[field.id] || ''}
                      onChange={(nextValue) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: nextValue }))}
                      options={field.options.map((option) => ({ value: option, label: option }))}
                      placeholder="Select"
                      triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 6, minHeight: compactFieldMinHeight, padding: isMobileViewport ? '9px 40px 9px 11px' : '10px 42px 10px 12px' }}
                      menuStyle={{ borderRadius: 18 }}
                    />
                  ) : field.type === 'checkbox' ? (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: isMobileViewport ? '10px 11px' : '11px 12px', border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff' }}>
                      <input type="checkbox" checked={serviceIntakeResponses[field.id] === true} onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.checked }))} />
                      <span style={{ fontSize: 13, color: STYLES.colors.text }}>Confirm</span>
                    </div>
                  ) : (
                    <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={serviceIntakeResponses[field.id] || ''} onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))} style={BOOKING_FIELD_STYLE} />
                  )}
                </label>
              ))}
            </div>
          </section>
        )}
      </div>
  );
}
