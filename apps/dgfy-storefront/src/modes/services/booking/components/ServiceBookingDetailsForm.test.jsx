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
  servicesPrimary: '#0f766e',
  servicesPrimaryBorder: '#99f6e4',
  servicesPrimaryShadow: 'rgba(15,118,110,0.24)',
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

  it('opens the schedule popup and commits a selected date and time', () => {
    const setServiceScheduleMode = vi.fn();
    const setServiceAppointmentAt = vi.fn();
    render(
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

    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    expect(setServiceAppointmentAt).toHaveBeenLastCalledWith('2026-08-16');
    expect(screen.getByRole('dialog', { name: 'Choose a time' })).toBeTruthy();
    expect(screen.queryByRole('listbox', { name: 'Select delivery time' })).toBeNull();

    fireEvent.change(screen.getByRole('combobox', { name: 'Available time' }), { target: { value: '10:00' } });
    expect(setServiceAppointmentAt).toHaveBeenLastCalledWith('2026-08-15T10:00');
    expect(screen.getByRole('dialog', { name: 'Schedule selected' })).toBeTruthy();
    expect(screen.getByText('Selected handoff')).toBeTruthy();
    expect(screen.queryByText('Suggested next slot')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Use this schedule' }));
    expect(screen.queryByRole('dialog')).toBeNull();
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
    expect(screen.queryByText('Available time')).toBeNull();

    fireEvent.click(screen.getByRole('option', { name: '2027' }));

    expect(screen.getByRole('grid', { name: 'August 2027' })).toBeTruthy();
    expect(screen.queryByRole('listbox', { name: 'Select year' })).toBeNull();
  });

  it('lets the calendar select a future date without inventing a time slot', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    expect(setServiceAppointmentAt).toHaveBeenLastCalledWith('2026-08-16');
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to date selection' })[0]);
    fireEvent.click(screen.getByRole('gridcell', { name: 'Aug 16, 2026, no available time slots' }));

    expect(setServiceAppointmentAt).toHaveBeenCalledWith('2026-08-16');
  });

  it('keeps a date selectable when availability data has a gap', () => {
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
        setServiceAppointmentAt={setServiceAppointmentAt}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Schedule for later/ }));
    fireEvent.click(screen.getByRole('gridcell', { name: 'Aug 16, 2026, no available time slots' }));

    expect(setServiceAppointmentAt).toHaveBeenCalledWith('2026-08-16');
  });
});
