// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosServicesOperationsWorkspace from '../components/PosServicesOperationsWorkspace.jsx';
import {
  createServiceAssignment,
  createServiceResource,
  createServiceWaitlistEntry,
  listServiceAssignments,
  listServiceBookings,
  listServiceResources,
  listServiceWaitlist,
  listServicesCatalog,
  queueDueServiceReminders,
  sendDueServiceReminders,
  settleServiceBooking,
  updateServiceAssignment,
  updateServiceBookingStatus,
  updateServiceWaitlistStatus
} from '../../services/api/servicesApi.js';

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({ posToast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/userService.js', () => ({ getAllUsers: vi.fn().mockResolvedValue([]) }));
vi.mock('../../services/api/servicesApi.js', () => ({
  createServiceAssignment: vi.fn(),
  createServiceResource: vi.fn(),
  createServiceWaitlistEntry: vi.fn(),
  listServiceAssignments: vi.fn().mockResolvedValue({ assignments: [] }),
  listServiceBookings: vi.fn().mockResolvedValue({ bookings: [] }),
  listServiceClients: vi.fn().mockResolvedValue({ clients: [] }),
  listServiceReminders: vi.fn().mockResolvedValue({ reminders: [] }),
  listServiceResources: vi.fn().mockResolvedValue({ resources: [] }),
  listServiceWaitlist: vi.fn().mockResolvedValue({ waitlist: [] }),
  listServicesCatalog: vi.fn().mockResolvedValue({ services: [] }),
  queueDueServiceReminders: vi.fn(),
  sendDueServiceReminders: vi.fn(),
  settleServiceBooking: vi.fn(),
  updateServiceAssignment: vi.fn(),
  updateServiceBookingStatus: vi.fn(),
  updateServiceWaitlistStatus: vi.fn()
}));

const allPermissions = {
  viewBookings: true,
  manageBookings: true,
  viewResources: true,
  manageResources: true,
  viewWaitlist: true,
  manageWaitlist: true,
  viewReminders: true,
  manageReminders: true,
  viewClients: true
};

describe('POS Services operations workspace', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('brings the SKUpervisor Services operational tabs into POS', async () => {
    render(<PosServicesOperationsWorkspace permissions={allPermissions} isOnline />);

    await waitFor(() => expect(listServiceBookings).toHaveBeenCalled());
    expect(screen.getByRole('tab', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Calendar' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Team & Resources' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Waitlist' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Reminders' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Clients' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Clients' }));
    expect(screen.getByText('No service clients yet.')).toBeTruthy();
  });

  it('does not call Services APIs while POS is offline', async () => {
    render(<PosServicesOperationsWorkspace permissions={allPermissions} isOnline={false} />);
    expect(screen.getByText('Service operations are available online only.')).toBeTruthy();
    expect(listServiceBookings).not.toHaveBeenCalled();
  });

  it('keeps booking actions disabled for view-only operators', async () => {
    listServiceBookings.mockResolvedValueOnce({
      bookings: [{
        booking_id: 7,
        public_reference: 'SVC-0007',
        service_name: 'Laundry basket',
        customer_name: 'View Only Client',
        start_at: new Date().toISOString(),
        status: 'confirmed',
        payment_status: 'unpaid',
        total_amount: 5000
      }]
    });

    render(<PosServicesOperationsWorkspace permissions={{ viewBookings: true, manageBookings: false }} isOnline />);

    const status = await screen.findByRole('combobox', { name: 'Status for SVC-0007' });
    expect(status.disabled).toBe(true);
    expect(screen.queryByRole('tab', { name: 'Team & Resources' })).toBeNull();
  });

  it('sorts Calendar chronologically, filters it, and performs governed lifecycle updates', async () => {
    const now = new Date();
    const later = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    const sooner = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    listServiceBookings.mockResolvedValueOnce({
      bookings: [
        { booking_id: 2, public_reference: 'SVC-LATER', service_name: 'Pressing', customer_name: 'Beta Client', start_at: later, status: 'confirmed' },
        { booking_id: 1, public_reference: 'SVC-SOONER', service_name: 'Laundry', customer_name: 'Alpha Client', start_at: sooner, status: 'requested' }
      ]
    });

    render(<PosServicesOperationsWorkspace permissions={allPermissions} isOnline />);
    await waitFor(() => expect(screen.getByText('SVC-SOONER')).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));

    const statusControls = screen.getAllByRole('combobox', { name: /^Status for/ });
    expect(statusControls.map((control) => control.getAttribute('aria-label'))).toEqual([
      'Status for SVC-SOONER',
      'Status for SVC-LATER'
    ]);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search calendar bookings' }), { target: { value: 'Alpha' } });
    expect(screen.getByText('SVC-SOONER')).toBeTruthy();
    expect(screen.queryByText('SVC-LATER')).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search calendar bookings' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter calendar by status' }), { target: { value: 'confirmed' } });
    expect(screen.getByText('SVC-LATER')).toBeTruthy();
    expect(screen.queryByText('SVC-SOONER')).toBeNull();

    fireEvent.change(screen.getByRole('combobox', { name: 'Status for SVC-LATER' }), { target: { value: 'checked_in' } });
    await waitFor(() => expect(updateServiceBookingStatus).toHaveBeenCalledWith(2, { status: 'checked_in' }));
  });

  it('shows an inline booking load error and retries without leaving POS', async () => {
    listServiceBookings.mockRejectedValueOnce(new Error('network unavailable'));
    render(<PosServicesOperationsWorkspace permissions={{ viewBookings: true }} isOnline />);

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to load Services operations.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(listServiceBookings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('creates location-scoped resources with normalized numeric capacity and location', async () => {
    render(<PosServicesOperationsWorkspace permissions={{ viewResources: true, manageResources: true }} isOnline />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Team & Resources' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Washer Bay 2' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'station' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Resource Location ID'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Resource' }));

    await waitFor(() => expect(createServiceResource).toHaveBeenCalledWith({
      name: 'Washer Bay 2',
      resource_type: 'station',
      capacity: 3,
      location_id: 12
    }));
  });

  it('requires an assignment anchor and submits the governed assignment payload', async () => {
    listServicesCatalog.mockResolvedValueOnce({ services: [{ item_id: 51, name: 'Laundry Basket' }] });
    listServiceResources.mockResolvedValueOnce({ resources: [{ resource_id: 8, name: 'Washer Bay', resource_type: 'station', capacity: 2 }] });
    render(<PosServicesOperationsWorkspace permissions={{ viewResources: true, manageResources: true }} isOnline />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Team & Resources' }));

    fireEvent.change(screen.getByLabelText('Service'), { target: { value: '51' } });
    const submit = screen.getByRole('button', { name: 'Create Assignment' });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: '8' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(createServiceAssignment).toHaveBeenCalledWith({
      item_id: 51,
      resource_id: 8,
      user_id: null,
      location_id: null
    }));
  });

  it('removes assignments through the API is_active contract', async () => {
    listServiceAssignments.mockResolvedValueOnce({ assignments: [{ assignment_id: 19, item_id: 51, service: { name: 'Laundry Basket' }, resource: { name: 'Washer Bay' } }] });
    render(<PosServicesOperationsWorkspace permissions={{ viewResources: true, manageResources: true }} isOnline />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Team & Resources' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove assignment for Laundry Basket' }));

    await waitFor(() => expect(updateServiceAssignment).toHaveBeenCalledWith(19, { is_active: false }));
  });

  it('requires waitlist contact and a valid schedule window before submitting the normalized payload', async () => {
    listServicesCatalog.mockResolvedValueOnce({ services: [{ item_id: 51, name: 'Laundry Basket' }] });
    render(<PosServicesOperationsWorkspace permissions={{ viewWaitlist: true, manageWaitlist: true }} isOnline />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Waitlist' }));

    fireEvent.change(screen.getByLabelText('Service'), { target: { value: '51' } });
    fireEvent.change(screen.getByLabelText('Client Name'), { target: { value: 'Maria Santos' } });
    const submit = screen.getByRole('button', { name: 'Add to Waitlist' });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '09171234567' } });
    fireEvent.change(screen.getByLabelText('Preferred From'), { target: { value: '2026-08-10T10:00' } });
    fireEvent.change(screen.getByLabelText('Preferred Until'), { target: { value: '2026-08-10T09:00' } });
    expect(screen.getByRole('alert').textContent).toContain('Preferred Until must be later');
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Preferred Until'), { target: { value: '2026-08-10T11:00' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Call before booking' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(createServiceWaitlistEntry).toHaveBeenCalledWith({
      service_item_id: 51,
      customer_name: 'Maria Santos',
      customer_email: null,
      customer_phone: '09171234567',
      preferred_start_at: new Date('2026-08-10T10:00').toISOString(),
      preferred_end_at: new Date('2026-08-10T11:00').toISOString(),
      notes: 'Call before booking'
    }));
  });

  it('updates waitlist status through the governed API contract', async () => {
    listServiceWaitlist.mockResolvedValueOnce({ waitlist: [{ waitlist_entry_id: 17, customer_name: 'Maria', customer_phone: '0917', status: 'waiting', service: { name: 'Laundry' } }] });
    render(<PosServicesOperationsWorkspace permissions={{ viewWaitlist: true, manageWaitlist: true }} isOnline />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Waitlist' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Waitlist status for Maria' }), { target: { value: 'notified' } });

    await waitFor(() => expect(updateServiceWaitlistStatus).toHaveBeenCalledWith(17, { status: 'notified' }));
  });

  it('queues reminders with the selected governed window and reports authoritative outcomes', async () => {
    queueDueServiceReminders.mockResolvedValueOnce({ queued_count: 2, skipped_count: 1, skipped: [{ reason: 'already_queued' }] });
    render(<PosServicesOperationsWorkspace permissions={{ viewReminders: true, manageReminders: true }} isOnline />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Reminders' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Reminder queue window' }), { target: { value: '72' } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue Due' }));

    await waitFor(() => expect(queueDueServiceReminders).toHaveBeenCalledWith({ lookahead_hours: 72 }));
    expect((await screen.findByRole('status')).textContent).toContain('2 queued · 1 skipped');
  });

  it('processes due reminders and surfaces sent, failed, and skipped counts', async () => {
    sendDueServiceReminders.mockResolvedValueOnce({ due_count: 4, sent_count: 2, failed_count: 1, skipped_count: 1 });
    render(<PosServicesOperationsWorkspace permissions={{ viewReminders: true, manageReminders: true }} isOnline />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Reminders' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send Due' }));

    await waitFor(() => expect(sendDueServiceReminders).toHaveBeenCalledWith());
    expect((await screen.findByRole('status')).textContent).toContain('2 sent · 1 failed · 1 skipped');
  });

  it('settles an eligible booking with the active shift contract and server-owned change', async () => {
    listServiceBookings.mockResolvedValueOnce({ bookings: [{
      booking_id: 31,
      public_reference: 'SVC-0031',
      service_name: 'Laundry Basket',
      customer_name: 'Maria',
      start_at: new Date().toISOString(),
      status: 'confirmed',
      payment_status: 'unpaid',
      payment_timing: 'postpaid',
      total_amount: 5000
    }] });
    settleServiceBooking.mockResolvedValueOnce({
      booking: { booking_id: 31, payment_status: 'paid' },
      pos_transaction: { pos_transaction_id: 900, invoice_number: 'SVC-000900', document_type: 'non_fiscal_slip', payment_type: 'cash', total_amount: 5000 },
      idempotency: { idempotent_replay: false }
    });
    render(<PosServicesOperationsWorkspace permissions={{ viewBookings: true, manageBookings: true }} isOnline settlementContext={{ shiftId: 77, terminalId: 'COUNTER-01', locationId: 3 }} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Collect Payment' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Cash received'), { target: { value: '6000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Payment' }));

    await waitFor(() => expect(settleServiceBooking).toHaveBeenCalledWith(31, {
      payment_type: 'cash',
      cash_received: 6000,
      shift_id: 77,
      terminal_id: 'COUNTER-01',
      location_id: 3
    }));
    expect((await screen.findByRole('status')).textContent).toContain('SVC-000900');
    expect(settleServiceBooking.mock.calls[0][1]).not.toHaveProperty('change_amount');
  });

  it('keeps collection disabled without an active cashier shift while scheduling remains available', async () => {
    listServiceBookings.mockResolvedValueOnce({ bookings: [{ booking_id: 32, public_reference: 'SVC-0032', service_name: 'Pressing', customer_name: 'Client', start_at: new Date().toISOString(), status: 'confirmed', payment_status: 'unpaid', total_amount: 100 }] });
    render(<PosServicesOperationsWorkspace permissions={{ viewBookings: true, manageBookings: true }} isOnline />);

    expect(await screen.findByText(/Open your cashier shift/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collect Payment' }).disabled).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Status for SVC-0032' }).disabled).toBe(false);
  });
});
