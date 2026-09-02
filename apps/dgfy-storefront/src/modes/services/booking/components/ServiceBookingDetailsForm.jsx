import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import { formatTimeSlotLabel } from '../model/serviceBookingSchedule.js';
import { ServiceBookingSectionHeader } from './ServiceBookingSectionHeader.jsx';
import { SERVICES_PALETTE } from '../../servicesPalette.js';

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

const getCalendarDateBounds = (dateOptions, fallbackDateValue) => {
  const validDateValues = dateOptions
    .map((option) => option?.value)
    .filter((value) => Boolean(parseCalendarDateValue(value)))
    .sort();
  return {
    start: validDateValues[0] || fallbackDateValue,
    end: validDateValues[validDateValues.length - 1] || fallbackDateValue
  };
};

const getCalendarMonthParts = (monthValue) => {
  const date = parseCalendarDateValue(monthValue) || new Date();
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
};

const getCalendarMonthCells = (monthValue) => {
  const { year, monthIndex } = getCalendarMonthParts(monthValue);
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  // Keep every month at six calendar rows so the shared Services calendar does
  // not resize when the month changes (February and 5-week months otherwise
  // leave the adjacent layout visibly unbalanced).
  return Array.from({ length: 42 }, (_, index) => {
    if (index < firstDay) return null;
    if (index >= firstDay + daysInMonth) return null;
    return formatCalendarDateValue(new Date(Date.UTC(year, monthIndex, index - firstDay + 1)));
  });
};

const getAdjacentCalendarMonthValue = (monthValue, direction) => {
  const date = parseCalendarDateValue(monthValue) || new Date();
  date.setUTCMonth(date.getUTCMonth() + direction);
  return `${date.getUTCFullYear()}-${padCalendarPart(date.getUTCMonth() + 1)}-01`;
};

const getCalendarMonthValueForYear = (year, monthIndex, minimumMonthValue) => {
  const minimumParts = getCalendarMonthParts(minimumMonthValue);
  if (year < minimumParts.year) return '';

  const firstAllowedMonthIndex = year === minimumParts.year ? minimumParts.monthIndex : 0;
  const lastAllowedMonthIndex = 11;
  const preferredMonthIndex = Number.isFinite(Number(monthIndex)) ? Number(monthIndex) : firstAllowedMonthIndex;
  const clampedMonthIndex = Math.min(
    Math.max(preferredMonthIndex, firstAllowedMonthIndex),
    lastAllowedMonthIndex
  );
  return `${year}-${padCalendarPart(clampedMonthIndex + 1)}-01`;
};

const getQuickDateOptions = (bookingDateOptions) => [
  { key: 'today', label: 'Today', offset: 0 },
  { key: 'tomorrow', label: 'Tomorrow', offset: 1 },
  { key: 'in-two-days', label: 'In 2 days', offset: 2 },
  { key: 'next-week', label: 'Next week', offset: 7, minimumOffset: 7 },
].map((preset) => ({
  ...preset,
  option: preset.minimumOffset
    ? bookingDateOptions.find((option) => Number(option.offset) >= preset.minimumOffset && option?.hasAvailability !== false) || null
    : bookingDateOptions.find((option) => Number(option.offset) === preset.offset && option?.hasAvailability !== false) || null,
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
.services-schedule-time-option:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(26, 78, 141, 0.12); }
.services-schedule-date:hover:not(:disabled) { transform: scale(1.08); box-shadow: 0 3px 8px rgba(26, 78, 141, 0.16); }
/* The time view replaces the calendar with a different-height grid. Keep this
   transition static so the dialog does not visibly stretch during the swap. */
.services-schedule-time-popup { animation: none; opacity: 1; transform: none; }
.services-schedule-on-site .services-schedule-icon-button:hover:not(:disabled),
.services-schedule-on-site .services-schedule-arrow:hover:not(:disabled),
.services-schedule-on-site .services-schedule-quick-choice:hover:not(:disabled),
.services-schedule-on-site .services-schedule-time-option:hover:not(:disabled),
.services-schedule-on-site .services-schedule-date:hover:not(:disabled) { box-shadow: none; }
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

// Keep the established on-site desktop workspace frame. The time list is
// constrained to this existing frame and scrolls internally when it needs
// more room, so the calendar keeps its original footprint.
const SERVICE_TIMING_DESKTOP_WORKSPACE_HEIGHT = 320;

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
        border: `1.5px solid ${active ? servicesPrimary : SERVICES_PALETTE.border}`,
        background: active ? SERVICES_PALETTE.primarySoft : SERVICES_PALETTE.surface,
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
      <div style={{ width: 40, height: 40, borderRadius: 10, background: active ? SERVICES_PALETTE.primaryLight : SERVICES_PALETTE.page, display: 'grid', placeItems: 'center', color: active ? servicesPrimary : SERVICES_PALETTE.textPrimary, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: '1 1 0%', minWidth: 0, display: 'grid', gap: 3 }}>
        <span style={{ color: active ? SERVICES_PALETTE.textPrimary : SERVICES_PALETTE.textSecondary, fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{label}</span>
        <span style={{ color: SERVICES_PALETTE.textMuted, fontSize: 12, lineHeight: 1.35 }}>{description}</span>
      </div>
      <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${active ? servicesPrimary : SERVICES_PALETTE.border}`, background: active ? servicesPrimary : SERVICES_PALETTE.surface, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {active ? <Check data-testid="services-selected-check" size={12} strokeWidth={3.2} /> : null}
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
  selectedServiceDatePart,
  bookingCalendarDateOptions = [],
  bookingDateOptions = [],
  bookingPreferredDateInputRef,
  selectedServiceTimePart,
  serviceScheduleMode = '',
  serviceFlowMethod = '',
  serviceFlowProfileMethod = '',
  bookingTimeSlotOptions = [],
  setServiceScheduleMode = () => {},
  setServiceAppointmentAt,
  bookingStepOneAdditionalFields,
  serviceIntakeResponses,
  setServiceIntakeResponses,
  servicesPrimary,
  servicesPrimarySoft = SERVICES_PALETTE.primarySoft,
  servicesPrimaryBorder = SERVICES_PALETTE.primaryBorder,
  servicesPrimaryShadow = SERVICES_PALETTE.primaryShadow,
  servicesDisplayFont,
}) {
  const compactFieldMinHeight = isMobileViewport ? 40 : 42;
  const normalizedFlowMethod = String(serviceFlowMethod || '').trim().toLowerCase();
  const normalizedProfileMethod = String(serviceFlowProfileMethod || '').trim().toLowerCase();
  const isOnSiteFlow = normalizedFlowMethod === 'on_site' || normalizedProfileMethod === 'on_site';
  const extraFields = bookingStepOneAdditionalFields.filter(field => field.id !== 'special_instructions' && field.id !== 'instructions');
  const recommendedDate = bookingDateOptions.find((option) => option.recommended) || null;
  const calendarDateOptions = bookingCalendarDateOptions.length > 0 ? bookingCalendarDateOptions : bookingDateOptions;
  // Laundry keeps its existing timing-choice entry point. On-site services
  // start directly in the date/time workspace because a visit must be
  // scheduled before the booking can continue.
  const [isSchedulePickerOpen, setIsSchedulePickerOpen] = useState(isOnSiteFlow);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [isTimeSelectionCommitted, setIsTimeSelectionCommitted] = useState(false);
  const [pickerDatePart, setPickerDatePart] = useState(selectedServiceDatePart || '');
  const [pickerTimePart, setPickerTimePart] = useState(isOnSiteFlow ? (selectedServiceTimePart || '') : '');
  const isOnSiteCalendarLocked = isOnSiteFlow && Boolean(pickerDatePart && pickerTimePart);
  const scheduleBeforePickerRef = useRef('');
  const resolvedScheduleMode = serviceScheduleMode === 'later'
    ? 'later'
    : serviceScheduleMode === 'now'
      ? 'now'
      : '';
  const recommendedSlotLabel = recommendedDate
    ? `${recommendedDate.label}, ${formatTimeSlotLabel(recommendedDate.recommendedTime)}`
    : 'No available slot is currently suggested';
  const dateOptionsByValue = new Map(calendarDateOptions.map((option) => [option.value, option]));
  const fallbackCalendarDateValue = formatCalendarDateValue(new Date());
  const { start: calendarStartDateValue } = getCalendarDateBounds(calendarDateOptions, fallbackCalendarDateValue);
  const calendarMinimumMonthValue = getCalendarMonthValue(calendarStartDateValue) || getCalendarMonthValue(formatCalendarDateValue(new Date()));
  const calendarMinimumYear = getCalendarMonthParts(calendarMinimumMonthValue).year;
  const initialCalendarMonth = getCalendarMonthValue(selectedServiceDatePart || calendarDateOptions[0]?.value) || calendarMinimumMonthValue;
  const [calendarMonthValue, setCalendarMonthValue] = useState(initialCalendarMonth);
  const [calendarPanel, setCalendarPanel] = useState('calendar');
  const [yearListEnd, setYearListEnd] = useState(calendarMinimumYear + 10);
  const getCalendarDateOption = (dateValue) => {
    const existingOption = dateOptionsByValue.get(dateValue);
    if (existingOption) return { ...existingOption, availabilityKnown: true };
    if (!calendarStartDateValue || dateValue < calendarStartDateValue) return null;
    return {
      value: dateValue,
      label: formatShortDateWithYear(dateValue),
      availabilityKnown: false,
      recommended: false,
      recommendedTime: ''
    };
  };
  const calendarDisplayMonthValue = calendarMonthValue < calendarMinimumMonthValue
    ? calendarMinimumMonthValue
    : calendarMonthValue;
  const calendarMonthParts = getCalendarMonthParts(calendarDisplayMonthValue);
  const calendarYearOptions = Array.from(
    { length: Math.max(1, yearListEnd - calendarMinimumYear + 1) },
    (_, index) => calendarMinimumYear + index
  );
  const calendarMonthLabels = getCalendarMonthLabels(calendarMonthParts.year);
  const calendarWeekdayLabels = getCalendarWeekdayLabels();
  const calendarMonthLabel = calendarMonthLabels[calendarMonthParts.monthIndex];
  const calendarMonthCells = getCalendarMonthCells(calendarDisplayMonthValue);
  const quickDateOptions = getQuickDateOptions(calendarDateOptions);
  const calendarSelectableStartDateValue = calendarStartDateValue;
  const hasPreviousCalendarMonth = calendarDisplayMonthValue > calendarMinimumMonthValue;
  const hasNextCalendarMonth = true;
  const calendarSelectedDatePart = pickerDatePart || selectedServiceDatePart;

  const getCurrentAppointmentValue = () => (
    selectedServiceDatePart && selectedServiceTimePart
      ? combineDateAndTimeParts(selectedServiceDatePart, selectedServiceTimePart)
      : ''
  );

  const closeSchedulePicker = useCallback(({ restore = true, preserveSelection = false } = {}) => {
    if (restore && !isOnSiteFlow) {
      setServiceAppointmentAt(scheduleBeforePickerRef.current);
    }
    if (!preserveSelection) {
      setPickerTimePart('');
      setIsTimeSelectionCommitted(false);
      setIsTimePickerOpen(false);
    }
    setIsSchedulePickerOpen(false);
  }, [isOnSiteFlow, setServiceAppointmentAt]);

  useEffect(() => {
    if (!isSchedulePickerOpen || isOnSiteFlow) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') closeSchedulePicker();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [closeSchedulePicker, isOnSiteFlow, isSchedulePickerOpen]);

  const selectNow = () => {
    scheduleBeforePickerRef.current = '';
    setServiceScheduleMode('now');
    const firstDate = bookingDateOptions[0]?.value || '';
    const nextTime = firstDate ? getPreferredBookingTimeForDate(activeBookingService, firstDate, '') : '';
    setPickerDatePart(firstDate);
    setPickerTimePart(nextTime);
    setServiceAppointmentAt(firstDate && nextTime ? combineDateAndTimeParts(firstDate, nextTime) : '');
    setIsTimeSelectionCommitted(false);
    setIsTimePickerOpen(false);
    setIsSchedulePickerOpen(false);
  };

  const openSchedulePicker = () => {
    scheduleBeforePickerRef.current = getCurrentAppointmentValue();
    setServiceScheduleMode('later');
    setPickerDatePart(selectedServiceDatePart || '');
    setPickerTimePart('');
    setServiceAppointmentAt(selectedServiceDatePart || '');
    setCalendarMonthValue(initialCalendarMonth);
    setCalendarPanel('calendar');
    setIsTimeSelectionCommitted(false);
    setIsTimePickerOpen(false);
    setIsSchedulePickerOpen(true);
  };

  const selectCalendarYear = (year) => {
    if (isOnSiteCalendarLocked) return;
    const nextMonthValue = getCalendarMonthValueForYear(year, calendarMonthParts.monthIndex, calendarMinimumMonthValue);
    if (!nextMonthValue) return;
    setCalendarMonthValue(nextMonthValue);
    setYearListEnd((currentEnd) => Math.max(currentEnd, year + 5));
    setCalendarPanel('calendar');
  };

  const selectCalendarDate = (nextDate) => {
    if (isOnSiteCalendarLocked) return;
    const selectedOption = getCalendarDateOption(nextDate);
    if (!selectedOption || (selectedOption.availabilityKnown && selectedOption.hasAvailability === false)) return;
    setServiceScheduleMode('later');
    setPickerDatePart(nextDate);
    setPickerTimePart('');
    setServiceAppointmentAt(nextDate);
    setCalendarMonthValue(getCalendarMonthValue(nextDate));
    setCalendarPanel('calendar');
    setIsTimeSelectionCommitted(false);
    setIsTimePickerOpen(true);
  };

  const selectedScheduleLabel = selectedServiceDatePart && selectedServiceTimePart
    ? `${formatShortDateWithYear(selectedServiceDatePart)}, ${formatTimeSlotLabel(selectedServiceTimePart)}`
    : 'Choose a date and time';
  const scheduleSubject = normalizedFlowMethod === 'on_site' || normalizedProfileMethod === 'on_site'
    ? 'service visit'
    : normalizedFlowMethod === 'appointment' || normalizedProfileMethod === 'appointment' || normalizedFlowMethod === 'online' || normalizedProfileMethod === 'online'
      ? 'appointment'
      : normalizedFlowMethod === 'hybrid' || normalizedProfileMethod === 'hybrid'
        ? 'service appointment'
        : 'handoff';
  const selectedScheduleTitle = `Selected ${scheduleSubject}`;
  const handleTimeSelection = (nextTime) => {
    const datePart = pickerDatePart || selectedServiceDatePart;
    if (!datePart || !bookingTimeSlotOptions.some((slot) => String(slot?.value || '') === String(nextTime || ''))) return;
    setPickerDatePart(datePart);
    setPickerTimePart(nextTime);
    setServiceAppointmentAt(combineDateAndTimeParts(datePart, nextTime));
    setIsTimeSelectionCommitted(true);
    // On-site services use the time panel as a second page. Once the time is
    // chosen, return to the calendar so the selected date remains visible.
    setIsTimePickerOpen(!isOnSiteFlow);
  };
  // A schedule is committed only after the user picks a time. This prevents
  // stale parent values or an empty slot response from presenting a completed
  // handoff as if it were selected in the current picker session.
  const hasCommittedSchedule = isTimeSelectionCommitted && Boolean(pickerDatePart && pickerTimePart);
  const summaryDatePart = pickerDatePart || selectedServiceDatePart;
  const summaryTimePart = pickerTimePart || ((!isTimePickerOpen && !isOnSiteFlow) ? selectedServiceTimePart : '');
  const hasSelectedSchedule = Boolean(summaryDatePart && summaryTimePart);
  const scheduleSurface = isOnSiteFlow ? SERVICES_PALETTE.surface : '#fff';
  const scheduleBorder = isOnSiteFlow ? servicesPrimaryBorder : '#e2e8f0';
  const scheduleControlBorder = isOnSiteFlow ? SERVICES_PALETTE.border : '#e2e8f0';
  const scheduleTextPrimary = isOnSiteFlow ? SERVICES_PALETTE.textPrimary : '#0f172a';
  const scheduleTextSecondary = isOnSiteFlow ? SERVICES_PALETTE.textSecondary : '#334155';
  const scheduleTextMuted = isOnSiteFlow ? SERVICES_PALETTE.textMuted : '#64748b';
  const scheduleDisabledText = isOnSiteFlow ? SERVICES_PALETTE.border : '#cbd5e1';
  const scheduleControlSoft = isOnSiteFlow ? SERVICES_PALETTE.page : '#f8fafc';
  const onSiteTimingWorkspaceHeight = isOnSiteFlow && !isMobileViewport
    ? SERVICE_TIMING_DESKTOP_WORKSPACE_HEIGHT
    : undefined;
  const scheduleDialogMaxHeight = isOnSiteFlow
    ? 'none'
    : (isMobileViewport ? 'min(94dvh, 760px)' : 'min(88dvh, 680px)');
  // Keep the calendar and time picker content-sized. The max-height plus the
  // shrinkable middle row below take over only when a long time-slot list
  // actually needs scrolling, so the footer stays close to the picker.
  const scheduleDialogHeight = onSiteTimingWorkspaceHeight;
  const scheduleTimeOptionsMaxHeight = isMobileViewport ? 196 : 220;
  const changeOnSiteDate = () => {
    if (!isOnSiteFlow) return;
    const datePart = pickerDatePart || selectedServiceDatePart;
    setPickerTimePart('');
    setIsTimeSelectionCommitted(false);
    setIsTimePickerOpen(false);
    setCalendarPanel('calendar');
    setCalendarMonthValue(getCalendarMonthValue(datePart) || initialCalendarMonth);
    setServiceAppointmentAt(datePart || '');
  };
  const timeSelector = bookingTimeSlotOptions.length > 0 ? (
    <div role="group" aria-label={`Available ${scheduleSubject} times`} className="services-schedule-time-options" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, maxHeight: scheduleTimeOptionsMaxHeight, minHeight: 0, alignContent: 'start', overflowY: 'auto', overscrollBehavior: 'contain', padding: 2 }}>
      {bookingTimeSlotOptions.map((slot, index) => {
        const isSelected = String(slot.value) === String(pickerTimePart);
        return (
          <button
            key={`${slot.value}-${index}`}
            type="button"
            className="services-schedule-time-option"
            aria-pressed={isSelected}
            onClick={() => handleTimeSelection(slot.value)}
            style={{ minHeight: 42, border: `1px solid ${isSelected ? servicesPrimary : servicesPrimaryBorder}`, borderRadius: 12, background: isSelected ? servicesPrimary : scheduleSurface, color: isSelected ? '#fff' : servicesPrimary, padding: '8px 10px', fontSize: 12, fontWeight: 800, lineHeight: 1.2, cursor: 'pointer', boxSizing: 'border-box' }}
          >
            {slot.label}
          </button>
        );
      })}
    </div>
  ) : (
    <div style={{ border: `1px solid ${scheduleControlBorder}`, borderRadius: 10, padding: '8px 10px', color: scheduleTextMuted, fontSize: 12, fontWeight: 600 }}>No available time slots</div>
  );
  const selectedHandoffSummary = (
    <div data-testid="selected-handoff-summary" role="status" aria-live="polite" style={{ display: 'grid', gap: 9, borderRadius: 14, border: `1px solid ${servicesPrimaryBorder}`, background: `linear-gradient(135deg, ${servicesPrimarySoft}, ${scheduleSurface})`, padding: '10px 11px', color: servicesPrimary, fontSize: 11, lineHeight: 1.25 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 999, background: servicesPrimary, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Check data-testid="services-selected-check" size={12} strokeWidth={3.2} />
        </span>
        <div style={{ display: 'grid', gap: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 12 }}>{hasSelectedSchedule ? selectedScheduleTitle : 'Service date and time'}</strong>
          <span style={{ color: servicesPrimary, fontSize: 10, fontWeight: 700 }}>{hasSelectedSchedule ? 'Ready to confirm' : 'Choose a date and time to continue'}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 10, background: servicesPrimarySoft, padding: '7px 8px' }}>
          <CalendarDays size={15} strokeWidth={2.4} />
          <div style={{ display: 'grid', gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</span>
            <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summaryDatePart ? formatShortDateWithYear(summaryDatePart) : null}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 10, background: servicesPrimarySoft, padding: '7px 8px' }}>
          <Clock3 size={15} strokeWidth={2.4} />
          <div style={{ display: 'grid', gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</span>
            <strong data-testid="selected-handoff-time" style={{ minHeight: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summaryTimePart ? formatTimeSlotLabel(summaryTimePart) : null}</strong>
          </div>
        </div>
      </div>
    </div>
  );
  const scheduleActions = (
    <div data-testid="service-schedule-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, paddingTop: 8, borderTop: `1px solid ${isOnSiteFlow ? servicesPrimaryBorder : '#eef2f7'}` }}>
      <button type="button" aria-label="Change date" onClick={isOnSiteFlow ? changeOnSiteDate : () => { setIsTimeSelectionCommitted(false); setIsTimePickerOpen(false); }} style={{ minHeight: 40, width: '100%', margin: 0, border: `1px solid ${SERVICES_PALETTE.errorBorder}`, borderRadius: 10, background: SERVICES_PALETTE.errorSoft, color: SERVICES_PALETTE.error, fontWeight: 800, cursor: 'pointer', boxSizing: 'border-box' }}>Change date</button>
      <button type="button" disabled={!hasCommittedSchedule} onClick={() => { scheduleBeforePickerRef.current = ''; closeSchedulePicker({ restore: false, preserveSelection: true }); }} style={{ minHeight: 40, width: '100%', border: 'none', borderRadius: 10, background: hasCommittedSchedule ? servicesPrimary : '#cbd5e1', color: '#fff', fontWeight: 800, cursor: hasCommittedSchedule ? 'pointer' : 'not-allowed' }}>Use this schedule</button>
    </div>
  );

  return (
    <div
      data-testid="service-timing-layout"
      style={{
        display: 'grid',
        gridTemplateColumns: isOnSiteFlow && !isMobileViewport
          ? 'minmax(0, 1.08fr) minmax(300px, 0.92fr)'
          : '1fr',
        gap: isOnSiteFlow ? 32 : 18,
        alignItems: 'start',
      }}
    >
      <div
        data-testid="service-timing-left-column"
        style={{
          display: 'grid',
          alignContent: 'start',
          gap: isOnSiteFlow ? 12 : 0,
          minWidth: 0,
          gridColumn: isOnSiteFlow && !isMobileViewport ? '1' : 'auto',
        }}
      >
      <section
        ref={registerBookingFieldRef('preferred_date')}
        style={{
          display: 'grid',
          gap: 12,
          minWidth: 0,
        }}
        aria-labelledby="service-timing-heading"
      >
          <ServiceBookingSectionHeader
            id="service-timing-heading"
            icon={<CalendarDays size={19} />}
            title={isOnSiteFlow ? 'Service timing' : '2. Service timing'}
            showIcon={false}
            servicesPrimary={servicesPrimary}
            servicesPrimarySoft={servicesPrimarySoft}
            servicesPrimaryBorder={servicesPrimaryBorder}
            servicesDisplayFont={servicesDisplayFont}
          />
          {!isOnSiteFlow ? (
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
          ) : !isSchedulePickerOpen ? (
            <button
              type="button"
              onClick={openSchedulePicker}
              style={{ minHeight: 48, border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 12, background: servicesPrimarySoft, color: servicesPrimary, fontSize: 13, fontWeight: 800, cursor: 'pointer', padding: '10px 14px', textAlign: 'left' }}
            >
              Edit service date and time
            </button>
          ) : null}
      </section>

      {isSchedulePickerOpen ? (
          <div
            role="presentation"
            className="services-schedule-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeSchedulePicker();
            }}
            style={isOnSiteFlow
              ? { position: 'relative', zIndex: 1, display: 'block', minHeight: onSiteTimingWorkspaceHeight, height: onSiteTimingWorkspaceHeight, padding: 0, background: 'transparent', gridColumn: !isMobileViewport ? '1' : 'auto' }
              : { position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: isMobileViewport ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobileViewport ? 0 : 20, background: 'rgba(15,23,42,0.42)' }}
          >
               <section role="dialog" aria-modal={isOnSiteFlow ? 'false' : 'true'} aria-label={isOnSiteFlow ? 'Service date and time' : undefined} aria-labelledby={!isOnSiteFlow ? 'service-schedule-dialog-title' : undefined} className={isOnSiteFlow ? 'services-schedule-dialog services-schedule-on-site' : 'services-schedule-dialog'} style={{ width: isOnSiteFlow ? '100%' : 'min(100%, 650px)', height: scheduleDialogHeight, minHeight: isOnSiteFlow ? onSiteTimingWorkspaceHeight : 0, maxHeight: scheduleDialogMaxHeight, overflow: isOnSiteFlow ? 'visible' : 'hidden', borderRadius: isOnSiteFlow ? 0 : (isMobileViewport ? '22px 22px 0 0' : 22), border: 'none', background: scheduleSurface, padding: isOnSiteFlow ? 0 : (isMobileViewport ? 14 : 20), boxSizing: 'border-box', boxShadow: isOnSiteFlow ? 'none' : '0 24px 70px rgba(15,23,42,0.24)', display: 'grid', gridTemplateRows: isOnSiteFlow ? 'minmax(0, 1fr)' : (isTimePickerOpen ? 'auto minmax(0, 1fr) auto' : 'auto auto auto'), gap: 10 }}>
              <style>{SCHEDULE_PICKER_CSS}</style>
               {!isOnSiteFlow ? (
                 <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                   <div style={{ display: 'grid', gap: 4 }}>
                     <h3 id="service-schedule-dialog-title" style={{ margin: 0, color: '#0f172a', fontSize: 18, fontWeight: 800 }}>Schedule for later</h3>
                     <p style={{ margin: 0, color: '#64748b', fontSize: 12, lineHeight: 1.4 }}>Choose a date and an available {scheduleSubject} time.</p>
                   </div>
                   <button type="button" aria-label="Close schedule picker" className="services-schedule-icon-button" onClick={() => closeSchedulePicker()} style={{ width: 34, height: 34, border: '1px solid #dbe5ee', borderRadius: 999, background: '#fff', color: '#334155', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                     <X size={18} />
                   </button>
                 </div>
               ) : null}

                <div data-testid="service-schedule-dialog-body" style={{ minHeight: 0, overflowY: isOnSiteFlow ? 'visible' : (isTimePickerOpen ? 'auto' : 'hidden'), overflowX: isOnSiteFlow ? 'visible' : 'hidden', overscrollBehavior: 'contain', paddingRight: 0, display: 'grid', alignContent: 'start', gap: 8 }}>
                 {!isTimePickerOpen ? (
                  <div data-testid="service-calendar-panel" style={{ display: 'grid', gap: 8, height: onSiteTimingWorkspaceHeight ? '100%' : undefined, border: `1px solid ${scheduleBorder}`, borderRadius: 14, padding: isMobileViewport ? 12 : 16, background: scheduleSurface, minHeight: isOnSiteFlow && !isMobileViewport ? 270 : undefined, boxSizing: 'border-box', alignContent: 'start' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) 32px', alignItems: 'center', gap: 4 }}>
                      <button
                        type="button"
                        aria-label="Previous month"
                        className="services-schedule-arrow"
                        disabled={isOnSiteCalendarLocked || !hasPreviousCalendarMonth}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isOnSiteCalendarLocked && hasPreviousCalendarMonth) setCalendarMonthValue(getAdjacentCalendarMonthValue(calendarDisplayMonthValue, -1));
                        }}
                        style={{ width: 28, height: 28, border: 'none', borderRadius: 999, background: scheduleControlSoft, color: servicesPrimary, display: 'grid', placeItems: 'center', cursor: !isOnSiteCalendarLocked && hasPreviousCalendarMonth ? 'pointer' : 'not-allowed', opacity: isOnSiteCalendarLocked ? 0.45 : (hasPreviousCalendarMonth ? 1 : 0.35) }}
                      >
                        <ChevronLeft size={18} />
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
                        <button
                          type="button"
                          aria-label="Select month"
                          disabled={isOnSiteCalendarLocked}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isOnSiteCalendarLocked) setCalendarPanel(calendarPanel === 'month' ? 'calendar' : 'month');
                          }}
                          style={{ border: 'none', background: 'transparent', color: scheduleTextPrimary, padding: '2px 1px', fontSize: 15, fontWeight: 900, cursor: isOnSiteCalendarLocked ? 'not-allowed' : 'pointer', opacity: isOnSiteCalendarLocked ? 0.6 : 1 }}
                        >
                          {calendarMonthLabel}
                        </button>
                        <button
                          type="button"
                          aria-label="Select year"
                          disabled={isOnSiteCalendarLocked}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isOnSiteCalendarLocked) setCalendarPanel(calendarPanel === 'year' ? 'calendar' : 'year');
                          }}
                          aria-expanded={calendarPanel === 'year'}
                          style={{ border: 'none', background: 'transparent', color: scheduleTextSecondary, padding: '2px 1px', fontSize: 15, fontWeight: 800, cursor: isOnSiteCalendarLocked ? 'not-allowed' : 'pointer', opacity: isOnSiteCalendarLocked ? 0.6 : 1 }}
                        >
                          {calendarMonthParts.year}
                        </button>
                      </div>

                      <button
                        type="button"
                        aria-label="Next month"
                        className="services-schedule-arrow"
                        disabled={isOnSiteCalendarLocked || !hasNextCalendarMonth}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isOnSiteCalendarLocked && hasNextCalendarMonth) setCalendarMonthValue(getAdjacentCalendarMonthValue(calendarDisplayMonthValue, 1));
                        }}
                        style={{ width: 28, height: 28, border: 'none', borderRadius: 999, background: scheduleControlSoft, color: servicesPrimary, display: 'grid', placeItems: 'center', cursor: !isOnSiteCalendarLocked && hasNextCalendarMonth ? 'pointer' : 'not-allowed', opacity: isOnSiteCalendarLocked ? 0.45 : (hasNextCalendarMonth ? 1 : 0.35) }}
                      >
                        <ChevronRight size={18} />
                      </button>
                  </div>

                  {calendarPanel === 'month' ? (
                    <div key="month-panel" className="services-schedule-panel" style={{ display: 'grid', gap: 6 }}>
                      <div style={{ color: scheduleTextMuted, fontSize: 11, fontWeight: 800, textAlign: 'center' }}>Select month</div>
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
                            disabled={isOnSiteCalendarLocked || !isAvailable}
                            onClick={() => {
                              if (!isOnSiteCalendarLocked) {
                                setCalendarMonthValue(monthValue);
                                setCalendarPanel('calendar');
                              }
                            }}
                            style={{ minHeight: 38, border: `1px solid ${isSelected ? servicesPrimary : scheduleControlBorder}`, borderRadius: 10, background: isSelected ? servicesPrimarySoft : scheduleSurface, color: isAvailable ? scheduleTextPrimary : scheduleDisabledText, fontSize: 12, fontWeight: isSelected ? 900 : 700, cursor: !isOnSiteCalendarLocked && isAvailable ? 'pointer' : 'not-allowed', opacity: isOnSiteCalendarLocked ? 0.72 : 1 }}
                          >
                            {month.slice(0, 3)}
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  ) : calendarPanel === 'year' ? (
                    <div key="year-panel" className="services-schedule-panel" style={{ display: 'grid', gap: 6 }}>
                      <div style={{ color: scheduleTextMuted, fontSize: 10, fontWeight: 800, textAlign: 'center' }}>Select year</div>
                      <div role="listbox" aria-label="Select year" onScroll={(event) => {
                        if (isOnSiteCalendarLocked) return;
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
                            disabled={isOnSiteCalendarLocked}
                            onClick={() => {
                              if (!isOnSiteCalendarLocked) selectCalendarYear(year);
                            }}
                            style={{ minHeight: 30, border: `1px solid ${isSelected ? servicesPrimary : scheduleControlBorder}`, borderRadius: 9, background: isSelected ? servicesPrimarySoft : scheduleSurface, color: scheduleTextPrimary, fontSize: 11, fontWeight: isSelected ? 900 : 700, cursor: isOnSiteCalendarLocked ? 'not-allowed' : 'pointer', opacity: isOnSiteCalendarLocked ? 0.72 : 1 }}
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
                           const isSelected = option?.value === calendarSelectedDatePart;
                          return (
                            <button
                            key={key}
                            type="button"
                              className="services-schedule-quick-choice"
                              disabled={isOnSiteCalendarLocked || !option}
                              onClick={() => !isOnSiteCalendarLocked && option && selectCalendarDate(option.value)}
                           style={{ minHeight: 28, border: `1px solid ${isSelected ? servicesPrimary : scheduleControlBorder}`, borderRadius: 8, background: isSelected ? servicesPrimarySoft : scheduleSurface, color: option ? scheduleTextSecondary : scheduleDisabledText, padding: '3px 2px', fontSize: 10, fontWeight: isSelected ? 900 : 700, cursor: !isOnSiteCalendarLocked && option ? 'pointer' : 'not-allowed', opacity: isOnSiteCalendarLocked ? 0.72 : 1 }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, color: scheduleTextMuted, fontSize: 9, fontWeight: 800, textAlign: 'center' }}>
                        {calendarWeekdayLabels.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
                      </div>
                      <div role="grid" aria-label={`${calendarMonthLabel} ${calendarMonthParts.year}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1 }}>
                        {calendarMonthCells.map((dateValue, index) => {
                          if (!dateValue) return <span key={`empty-${index}`} aria-hidden="true" style={{ minHeight: isMobileViewport ? 22 : 24 }} />;
                          const dateOption = getCalendarDateOption(dateValue);
                           const isSelected = dateValue === calendarSelectedDatePart;
                          const isRecommended = Boolean(dateOption?.recommended);
                          const hasAvailability = dateOption?.hasAvailability !== false;
                          const isPastDate = dateValue < calendarSelectableStartDateValue;
                          const isDateSelectable = Boolean(dateOption)
                            && !(dateOption.availabilityKnown && dateOption.hasAvailability === false)
                            && !isPastDate;
                          return (
                            <button
                              key={dateValue}
                              type="button"
                              className="services-schedule-date"
                              role="gridcell"
                              aria-label={dateOption ? `${dateOption.label}${hasAvailability ? '' : ', no available time slots'}${isRecommended ? ', recommended' : ''}` : dateValue}
                              aria-selected={isSelected}
                              disabled={isOnSiteCalendarLocked || !isDateSelectable}
                              onClick={() => !isOnSiteCalendarLocked && selectCalendarDate(dateValue)}
                              style={{ minHeight: isMobileViewport ? 22 : 24, border: `1px solid ${isSelected ? servicesPrimary : isRecommended ? servicesPrimaryBorder : 'transparent'}`, borderRadius: 999, background: isSelected ? servicesPrimary : isRecommended ? servicesPrimarySoft : 'transparent', color: dateOption ? (isSelected ? '#fff' : isPastDate ? scheduleTextMuted : scheduleTextSecondary) : scheduleDisabledText, fontSize: 10, fontWeight: isSelected || isRecommended ? 900 : 600, cursor: !isOnSiteCalendarLocked && isDateSelectable ? 'pointer' : 'not-allowed', opacity: isOnSiteCalendarLocked ? 0.72 : 1 }}
                            >
                              {parseCalendarDateValue(dateValue).getUTCDate()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  </div>
                 ) : null}

                 {isTimePickerOpen ? (
                    <div role="dialog" aria-modal="false" aria-labelledby="service-time-dialog-title" className="services-schedule-time-popup" style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateRows: isOnSiteFlow ? 'auto minmax(0, 1fr) auto' : undefined, height: onSiteTimingWorkspaceHeight ? `${onSiteTimingWorkspaceHeight}px` : undefined, minHeight: onSiteTimingWorkspaceHeight ? `${onSiteTimingWorkspaceHeight}px` : 0, alignContent: isOnSiteFlow ? 'stretch' : 'start', gap: 10, overflow: 'hidden', boxSizing: 'border-box', border: `1px solid ${scheduleBorder}`, borderRadius: 14, padding: isMobileViewport ? 12 : 16, background: scheduleSurface, boxShadow: isOnSiteFlow ? 'none' : '0 12px 30px rgba(15,23,42,0.08)', transition: 'box-shadow 240ms ease', animation: 'none', opacity: 1, transform: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ display: 'grid', gap: 2, minWidth: 0, width: '100%' }}>
                        <h4 id="service-time-dialog-title" style={{ margin: 0, color: scheduleTextPrimary, fontSize: 15, fontWeight: 800 }}>Choose a time</h4>
                        <div style={{ color: scheduleTextMuted, fontSize: 11, fontWeight: 600 }}>Select an available {scheduleSubject} time for {formatShortDateWithYear(pickerDatePart || selectedServiceDatePart)}</div>
                      </div>
                    </div>

                    {!isOnSiteFlow ? selectedHandoffSummary : null}

                    <div style={{ display: 'grid', gap: 4, minHeight: 0, color: scheduleTextSecondary, fontSize: 12, fontWeight: 700 }}>
                      <span>Available {scheduleSubject} time</span>
                      {timeSelector}
                    </div>
                  </div>
                 ) : null}
              </div>

              {!isOnSiteFlow && isTimePickerOpen ? scheduleActions : null}
            </section>
          </div>
        ) : null}
      </div>

        {isOnSiteFlow ? (
          <div
            data-testid="service-timing-selection-column"
            aria-label="Selected service date and time"
            style={{
              gridColumn: !isMobileViewport ? '2' : 'auto',
              // Only span the extra-fields row when that row exists. Without
              // extra fields, spanning two rows creates an empty implicit
              // grid row and pushes the Location section down unnecessarily.
              gridRow: !isMobileViewport
                ? (extraFields.length > 0 ? '1 / span 2' : '1')
                : 'auto',
              minWidth: 0,
              display: 'grid',
              alignContent: 'start',
              gap: 12,
              padding: 0,
              background: 'transparent',
              boxSizing: 'border-box',
              alignSelf: 'start',
              justifyItems: 'stretch',
            }}
          >
            <ServiceBookingSectionHeader
              id="selected-date-time-heading"
              title="Selected date and time"
              showIcon={false}
              servicesPrimary={servicesPrimary}
              servicesPrimarySoft={servicesPrimarySoft}
              servicesPrimaryBorder={servicesPrimaryBorder}
              servicesDisplayFont={servicesDisplayFont}
            />
            {selectedHandoffSummary}
            {hasSelectedSchedule ? (
              <button
                type="button"
                data-testid="change-service-date"
                onClick={changeOnSiteDate}
                style={{ minHeight: 42, width: '100%', border: `1px solid ${SERVICES_PALETTE.errorBorder}`, borderRadius: 10, background: SERVICES_PALETTE.errorSoft, color: SERVICES_PALETTE.error, padding: '9px 12px', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxSizing: 'border-box' }}
              >
                Change date
              </button>
            ) : null}
          </div>
        ) : null}

        {extraFields.length > 0 && (
          <section style={{ display: 'grid', gap: 14, gridColumn: isOnSiteFlow && !isMobileViewport ? '1 / -1' : 'auto' }}>
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
