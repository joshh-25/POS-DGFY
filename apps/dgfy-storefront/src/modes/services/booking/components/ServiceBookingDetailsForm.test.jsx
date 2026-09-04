// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceBookingDetailsForm } from './ServiceBookingDetailsForm.jsx';

const baseProps = {
  STYLES: { colors: { dark: '#0f172a', muted: '#64748b' } },
  BOOKING_FIELD_STYLE: { border: '1px solid #cbd5e1', borderRadius: 12 },
  StorefrontDropdown: ({ value, onChange, options, placeholder, disabled }) => (
    <select aria-label="Available time" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {!value ? <option value="">{placeholder}</option> : null}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
  registerBookingFieldRef: () => undefined,
  shouldBookingFieldSpanFullWidth: () => false,
  combineDateAndTimeParts: (date, time) => `${date}T${time}`,
  getPreferredBookingTimeForDate: vi.fn(() => '10:00'),
  activeBookingService: { item_id: 42 },
  isMobileViewport: false,
  bookingFieldPlan: {},
  selectedServiceDatePart: '2026-08-15',
  bookingDateOptions: [
    { value: '2026-08-15', label: 'Aug 15, 2026', offset: 0, recommended: true, recommendedTime: '10:00' },
    { value: '2026-08-16', label: 'Aug 16, 2026', offset: 1, recommended: false, recommendedTime: '10:00' },
    { value: '2026-08-17', label: 'Aug 17, 2026', offset: 2, recommended: false, recommendedTime: '10:00' },
    { value: '2026-08-22', label: 'Aug 22, 2026', offset: 7, recommended: false, recommendedTime: '10:00' },
  ],
  bookingPreferredDateInputRef: React.createRef(),
  selectedServiceTimePart: '10:00',
  serviceScheduleMode: 'now',
  bookingTimeSlotOptions: [{ value: '10:00', label: '10:00 AM' }],
  setServiceScheduleMode: vi.fn(),
  setServiceAppointmentAt: vi.fn(),
  serviceUnitType: '',
  setServiceUnitType: vi.fn(),
  bookingStepOneAdditionalFields: [],
  serviceIntakeResponses: {},
  setServiceIntakeResponses: vi.fn(),
  servicesPrimary: '#1A4E8D',
  servicesPrimaryBorder: 'rgba(26,78,141,0.2)',
  servicesPrimaryShadow: 'rgba(26,78,141,0.24)',
};

describe('ServiceBookingDetailsForm timing choices', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Now and Schedule for later as the Step 2 choices', () => {
    render(<ServiceBookingDetailsForm {...baseProps} />);

    expect(screen.getByText('2. Service timing')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Now/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Schedule for later/ })).toBeTruthy();
  });

  it('uses the same plain check indicator for an active schedule choice', () => {
    render(<ServiceBookingDetailsForm {...baseProps} serviceScheduleMode="later" />);

    const scheduleCard = screen.getByRole('button', { name: /^Schedule for later/ });
    const checkIcon = scheduleCard.querySelector('[data-testid="services-selected-check"]');

    expect(scheduleCard.getAttribute('aria-pressed')).toBe('true');
    expect(checkIcon).not.toBeNull();
    expect(checkIcon?.getAttribute('width')).toBe('12');
  });

  it('does not mark a schedule choice active when the schedule mode is empty', () => {
    render(<ServiceBookingDetailsForm {...baseProps} serviceScheduleMode="" />);

    expect(screen.getByRole('button', { name: /^Now/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /^Schedule for later/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the calendar selection neutral when no schedule mode is selected', () => {
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        serviceOrderMethod=""
        serviceScheduleMode=""
      />
    );

    expect(screen.getByRole('button', { name: /^Now/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /^Schedule for later/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Pick up and deliver')).toBeNull();
  });

  it('opens the schedule popup and commits a selected date and time', () => {
    const setServiceScheduleMode = vi.fn();
    const setServiceAppointmentAt = vi.fn();
    const { rerender } = render(
      <ServiceBookingDetailsForm
        {...baseProps}
        setServiceScheduleMode={setServiceScheduleMode}
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    expect(setServiceScheduleMode).toHaveBeenCalledWith('later');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByText('Suggested next slot')).toBeNull();
    expect(screen.getByRole('button', { name: 'Select month' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select year' })).toBeTruthy();
    expect(screen.getByRole('grid', { name: 'August 2026' }).children).toHaveLength(42);

    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    expect(setServiceAppointmentAt).toHaveBeenLastCalledWith('2026-08-16');
    expect(screen.getByRole('dialog', { name: 'Choose a time' })).toBeTruthy();
    expect(screen.queryByRole('grid', { name: 'August 2026' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Available handoff times' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Choose a time' }).style.alignContent).toBe('start');
    expect(screen.getByRole('button', { name: '10:00 AM' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Available time' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Available handoff times' }).style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
    expect(screen.queryByRole('listbox', { name: 'Select delivery time' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Use this schedule' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Change date' })).toBeTruthy();
    expect(screen.getByTestId('selected-handoff-time').textContent).toBe('');

    rerender(
      <ServiceBookingDetailsForm
        {...baseProps}
        selectedServiceDatePart="2026-08-16"
        selectedServiceTimePart=""
        setServiceScheduleMode={setServiceScheduleMode}
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );
    expect(screen.getByTestId('selected-handoff-summary')).toBeTruthy();
    expect(screen.getByTestId('selected-handoff-time').textContent).toBe('');
    expect(screen.getByRole('dialog', { name: 'Choose a time' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '10:00 AM' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '10:00 AM' }));
    expect(setServiceAppointmentAt).toHaveBeenLastCalledWith('2026-08-16T10:00');
    rerender(
      <ServiceBookingDetailsForm
        {...baseProps}
        selectedServiceDatePart="2026-08-16"
        selectedServiceTimePart="10:00"
        setServiceScheduleMode={setServiceScheduleMode}
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );
    expect(screen.getByTestId('selected-handoff-summary')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Choose a time' })).toBeTruthy();
    expect(screen.getByText('Selected handoff')).toBeTruthy();
    expect(screen.getByText('Ready to confirm')).toBeTruthy();
    expect(screen.queryByText('Suggested next slot')).toBeNull();
    expect(screen.getByRole('group', { name: 'Available handoff times' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '10:00 AM' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Use this schedule' }).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to date selection' })).toBeNull();
    const changeDateButton = screen.getByRole('button', { name: 'Change date' });
    expect(changeDateButton.style.color).toBe('rgb(176, 79, 79)');
    expect(changeDateButton.style.width).toBe('100%');
    expect(changeDateButton.querySelector('svg')).toBeNull();

    fireEvent.click(changeDateButton);
    expect(screen.getByRole('grid', { name: 'August 2026' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use this schedule' })).toBeNull();
  });

  it('keeps the selected-handoff indicator and action state synchronized in the live flow', () => {
    function ControlledScheduleForm() {
      const [appointmentAt, setAppointmentAt] = React.useState('');
      const [scheduleMode, setScheduleMode] = React.useState('');
      const datePart = appointmentAt.split('T')[0] || '';
      const timePart = appointmentAt.split('T')[1] || '';

      return (
        <ServiceBookingDetailsForm
          {...baseProps}
          selectedServiceDatePart={datePart}
          selectedServiceTimePart={timePart}
          serviceScheduleMode={scheduleMode}
          setServiceScheduleMode={setScheduleMode}
          setServiceAppointmentAt={setAppointmentAt}
        />
      );
    }

    render(<ControlledScheduleForm />);

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    fireEvent.click(screen.getByRole('button', { name: '10:00 AM' }));

    expect(screen.getByTestId('selected-handoff-summary')).toBeTruthy();
    expect(screen.getByTestId('selected-handoff-time').textContent).toBe('10:00 AM');
    expect(screen.getByRole('button', { name: 'Use this schedule' }).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('sets Now to the next valid slot and closes the popup', () => {
    const setServiceScheduleMode = vi.fn();
    const setServiceAppointmentAt = vi.fn();
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        serviceScheduleMode="later"
        setServiceScheduleMode={setServiceScheduleMode}
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Now/ }));

    expect(setServiceScheduleMode).toHaveBeenCalledWith('now');
    expect(setServiceAppointmentAt).toHaveBeenCalledWith('2026-08-15T10:00');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps year selection separate from time and moves to an available month in that year', () => {
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        bookingDateOptions={[
          ...baseProps.bookingDateOptions,
          { value: '2027-09-01', label: 'Sep 1, 2027', offset: 380, recommended: false, recommendedTime: '10:00' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Select year' }));
    expect(screen.getByRole('listbox', { name: 'Select year' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '2026' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '2027' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '2036' })).toBeTruthy();
    expect(screen.queryByText('Available time')).toBeNull();

    fireEvent.click(screen.getByRole('option', { name: '2027' }));

    expect(screen.getByRole('grid', { name: 'August 2027' })).toBeTruthy();
    expect(screen.queryByRole('listbox', { name: 'Select year' })).toBeNull();
  });

  it('keeps future month and year choices open across a year boundary', () => {
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        selectedServiceDatePart="2026-12-31"
        selectedServiceTimePart=""
        serviceScheduleMode=""
        bookingCalendarDateOptions={[
          { value: '2026-12-31', label: 'Dec 31, 2026', hasAvailability: true, recommended: true, recommendedTime: '10:00' },
          { value: '2027-01-01', label: 'Jan 1, 2027', hasAvailability: true, recommended: false, recommendedTime: '10:00' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    expect(screen.getByRole('grid', { name: 'December 2026' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Select month' }));
    expect(screen.getByRole('option', { name: 'Nov' }).disabled).toBe(true);
    expect(screen.getByRole('option', { name: 'Dec' }).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Select year' }));
    expect(screen.getByRole('option', { name: '2026' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '2027' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '2036' })).toBeTruthy();

    fireEvent.click(screen.getByRole('option', { name: '2027' }));
    expect(screen.getByRole('grid', { name: 'December 2027' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next month' }).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Select month' }));
    expect(screen.getByRole('option', { name: 'Jan' }).disabled).toBe(false);
    expect(screen.getByRole('option', { name: 'Feb' }).disabled).toBe(false);
  });

  it('allows a future date outside the preloaded availability window to be selected', () => {
    const setServiceAppointmentAt = vi.fn();
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Select month' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dec' }));
    const futureDate = screen.getByRole('gridcell', { name: 'Dec 15, 2026' });
    expect(futureDate.disabled).toBe(false);
    fireEvent.click(futureDate);

    expect(setServiceAppointmentAt).toHaveBeenLastCalledWith('2026-12-15');
    expect(screen.getByRole('dialog', { name: 'Choose a time' })).toBeTruthy();
  });

  it('keeps unavailable dates visible but prevents the blank time state', () => {
    const setServiceAppointmentAt = vi.fn();
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        getPreferredBookingTimeForDate={() => ''}
        bookingCalendarDateOptions={[
          { value: '2026-08-15', label: 'Aug 15, 2026', offset: 0, hasAvailability: true, recommended: true, recommendedTime: '10:00' },
          { value: '2026-08-16', label: 'Aug 16, 2026', offset: 1, hasAvailability: false, recommended: false, recommendedTime: '' },
        ]}
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    setServiceAppointmentAt.mockClear();
    const unavailableDate = screen.getByRole('gridcell', { name: 'Aug 16, 2026, no available time slots' });
    expect(unavailableDate.disabled).toBe(true);
    fireEvent.click(unavailableDate);

    expect(setServiceAppointmentAt).not.toHaveBeenCalled();
    expect(screen.getByRole('grid', { name: 'August 2026' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Choose a time' })).toBeNull();
  });

  it('keeps future dates selectable when only available-date shortcuts are supplied', () => {
    const setServiceAppointmentAt = vi.fn();
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        getPreferredBookingTimeForDate={() => ''}
        bookingDateOptions={[
          { value: '2026-08-15', label: 'Aug 15, 2026', offset: 0, hasAvailability: true, recommended: true, recommendedTime: '10:00' },
          { value: '2026-08-17', label: 'Aug 17, 2026', offset: 2, hasAvailability: true, recommended: false, recommendedTime: '10:00' },
        ]}
        bookingCalendarDateOptions={[]}
        bookingTimeSlotOptions={[]}
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    setServiceAppointmentAt.mockClear();
    const gapDate = screen.getByRole('gridcell', { name: 'Aug 16, 2026' });
    expect(gapDate.disabled).toBe(false);
    fireEvent.click(gapDate);

    expect(setServiceAppointmentAt).toHaveBeenLastCalledWith('2026-08-16');
    expect(screen.getByRole('dialog', { name: 'Choose a time' })).toBeTruthy();
  });

  it('uses the same Laundry-style calendar picker for the template handoff flow', () => {
    const setServiceAppointmentAt = vi.fn();
    const calendarDateOptions = [
      ...baseProps.bookingDateOptions,
      { value: '2026-09-01', label: 'Sep 1, 2026', offset: 17, hasAvailability: true, recommended: false, recommendedTime: '10:00' },
    ];
    const { rerender } = render(
      <ServiceBookingDetailsForm
        {...baseProps}
        bookingCalendarDateOptions={calendarDateOptions}
        serviceOrderMethod="delivery"
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );

    expect(screen.getByRole('heading', { name: '2. Service timing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Schedule for later/ })).toBeTruthy();
    expect(screen.queryByRole('grid', { name: 'August 2026' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    expect(screen.getByRole('grid', { name: 'August 2026' })).toBeTruthy();
    const calendarDialog = screen.getByRole('dialog', { name: 'Schedule for later' });
    expect(calendarDialog.style.height).toBe('');
    expect(calendarDialog.style.gridTemplateRows).toBe('auto auto auto');
    expect(screen.getByTestId('service-schedule-dialog-body').style.overflowY).toBe('hidden');
    fireEvent.click(screen.getByRole('gridcell', { name: 'Aug 16, 2026' }));
    expect(setServiceAppointmentAt).toHaveBeenLastCalledWith('2026-08-16');
    const scheduleDialog = screen.getByRole('dialog', { name: 'Schedule for later' });
    expect(scheduleDialog.style.height).toBe('');
    expect(scheduleDialog.style.gridTemplateRows).toBe('auto minmax(0, 1fr) auto');
    expect(screen.getByTestId('service-schedule-dialog-body').style.overflowY).toBe('auto');
    const timeDialog = scheduleDialog.querySelector('.services-schedule-time-popup');
    expect(timeDialog.style.overflow).toBe('hidden');
    expect(timeDialog.style.animation).toBe('none');
    expect(timeDialog.style.transform).toBe('none');
    rerender(
      <ServiceBookingDetailsForm
        {...baseProps}
        bookingCalendarDateOptions={calendarDateOptions}
        selectedServiceDatePart="2026-08-16"
        serviceOrderMethod="delivery"
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '10:00 AM' }));
    expect(setServiceAppointmentAt).toHaveBeenLastCalledWith('2026-08-16T10:00');

    fireEvent.click(screen.getByRole('button', { name: 'Change date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('grid', { name: 'September 2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next month' }).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Close schedule picker' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('restores the last committed schedule when the picker is closed before confirmation', () => {
    const setServiceAppointmentAt = vi.fn();
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close schedule picker' }));

    expect(setServiceAppointmentAt).toHaveBeenLastCalledWith('2026-08-15T10:00');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps four time buttons per row on mobile and leaves time empty after date selection', () => {
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        isMobileViewport
        selectedServiceDatePart=""
        selectedServiceTimePart=""
        serviceScheduleMode=""
        bookingTimeSlotOptions={[
          { value: '09:00', label: '9:00 AM' },
          { value: '10:00', label: '10:00 AM' },
          { value: '11:00', label: '11:00 AM' },
          { value: '12:00', label: '12:00 PM' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));

    const scheduleDialog = screen.getByRole('dialog', { name: 'Schedule for later' });
    expect(scheduleDialog.style.gridTemplateRows).toBe('auto minmax(0, 1fr) auto');
    expect(screen.getByTestId('service-schedule-dialog-body').style.overflowY).toBe('auto');
    const timeOptions = screen.getByRole('group', { name: 'Available handoff times' });
    expect(timeOptions.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
    expect(timeOptions.style.maxHeight).toBe('196px');
    expect(screen.getByTestId('selected-handoff-time').textContent).toBe('');
  });

  it('does not render the legacy additional-details block when the service has no configured intake fields', () => {
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        serviceOrderMethod="on_site"
        bookingStepOneAdditionalFields={[]}
      />
    );

    expect(screen.queryByText('Additional Service Details')).toBeNull();
    expect(screen.queryByText('Aircon unit type')).toBeNull();
  });

  it('opens the on-site flow directly in the date and time workspace', () => {
    const setServiceScheduleMode = vi.fn();
    const setServiceAppointmentAt = vi.fn();
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        serviceFlowMethod="on_site"
        serviceScheduleMode=""
        selectedServiceDatePart=""
        selectedServiceTimePart=""
        setServiceScheduleMode={setServiceScheduleMode}
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );

    expect(screen.getByRole('heading', { name: 'Service timing' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '2. Service timing' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Now/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Schedule for later/ })).toBeNull();
    expect(screen.getByTestId('service-timing-layout').style.gridTemplateColumns).toBe('minmax(0, 1.08fr) minmax(300px, 0.92fr)');
    const leftColumn = screen.getByTestId('service-timing-left-column');
    expect(leftColumn.style.gridColumn).toBe('1');
    expect(leftColumn.style.gap).toBe('12px');
    const selectionColumn = screen.getByTestId('service-timing-selection-column');
    expect(selectionColumn).toBeTruthy();
    expect(selectionColumn.style.gridRow).toBe('1');
    expect(selectionColumn.style.gap).toBe(leftColumn.style.gap);
    expect(selectionColumn.textContent).not.toContain('Service timing');
    expect(screen.getByRole('dialog', { name: 'Service date and time' }).style.gridTemplateRows).toBe('minmax(0, 1fr)');
    expect(screen.getByRole('dialog', { name: 'Service date and time' }).style.minHeight).toBe('320px');
    expect(selectionColumn.style.border).toBe('');
    expect(selectionColumn.style.boxShadow).toBe('');
    expect(screen.getByRole('heading', { name: 'Selected date and time' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Service Date and Time' })).toBeNull();
    const leftHeading = screen.getByRole('heading', { name: 'Service timing' });
    const rightHeading = screen.getByRole('heading', { name: 'Selected date and time' });
    expect(leftHeading.style.fontSize).toBe('15px');
    expect(rightHeading.style.fontSize).toBe(leftHeading.style.fontSize);
    expect(rightHeading.style.fontWeight).toBe(leftHeading.style.fontWeight);
    expect(screen.getByRole('grid', { name: 'August 2026' })).toBeTruthy();
    const calendarPanel = screen.getByTestId('service-calendar-panel');
    expect(calendarPanel.style.height).toBe('100%');
    expect(calendarPanel.style.minHeight).toBe('270px');

    fireEvent.click(screen.getByRole('gridcell', { name: 'Aug 16, 2026' }));
    expect(setServiceScheduleMode).toHaveBeenCalledWith('later');
    expect(screen.queryByRole('grid', { name: 'August 2026' })).toBeNull();
    const timeDialog = screen.getByRole('dialog', { name: 'Choose a time' });
    expect(timeDialog).toBeTruthy();
    expect(timeDialog.style.height).toBe('320px');
    expect(timeDialog.style.minHeight).toBe('320px');
    expect(timeDialog.style.overflow).toBe('hidden');
    expect(timeDialog.querySelector('[data-testid="service-schedule-actions"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '10:00 AM' }));
    expect(screen.getByRole('grid', { name: 'August 2026' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Choose a time' })).toBeNull();
    expect(screen.getByRole('gridcell', { name: 'Aug 16, 2026' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('selected-handoff-summary')).toBeTruthy();
    expect(selectionColumn.textContent).toContain('Aug 16, 2026');
    expect(selectionColumn.textContent).toContain('10:00 AM');
    const selectedDate = screen.getByRole('gridcell', { name: 'Aug 16, 2026' });
    expect(selectedDate.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Previous month' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Select month' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Select year' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Next month' }).disabled).toBe(true);
    const changeDateButton = screen.getByRole('button', { name: 'Change date' });
    expect(changeDateButton.style.minHeight).toBe('42px');

    fireEvent.click(changeDateButton);
    expect(screen.getByRole('grid', { name: 'August 2026' })).toBeTruthy();
    expect(screen.getByTestId('selected-handoff-time').textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Select month' }).disabled).toBe(false);
    expect(screen.getByRole('gridcell', { name: 'Aug 16, 2026' }).disabled).toBe(false);
  });

  it('stacks the on-site timing columns on mobile', () => {
    render(
      <ServiceBookingDetailsForm
        {...baseProps}
        isMobileViewport
        serviceFlowMethod="on_site"
        serviceScheduleMode=""
        selectedServiceDatePart=""
        selectedServiceTimePart=""
      />
    );

    expect(screen.getByTestId('service-timing-layout').style.gridTemplateColumns).toBe('1fr');
    expect(screen.getByTestId('service-timing-selection-column')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Now/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Schedule for later/ })).toBeNull();
    expect(screen.getByRole('grid', { name: 'August 2026' })).toBeTruthy();
  });
});
