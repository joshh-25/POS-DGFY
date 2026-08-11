// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ServiceBookingTable,
  ServiceClientsPanel,
  ServiceRemindersPanel,
  ServiceTeamResourcesPanel,
  ServiceWaitlistPanel
} from '../components/ServiceOperationsPanels.jsx';

describe('shared Services operational panels', () => {
  afterEach(() => cleanup());

  it('preserves deterministic booking status choices and reports the selected transition', () => {
    const onStatusChange = vi.fn();
    render(
      <ServiceBookingTable
        bookings={[{
          booking_id: 11,
          public_reference: 'SVC-11',
          status: 'confirmed',
          service_name: 'Laundry Basket',
          customer_name: 'Client',
          start_at: '2026-08-09T09:00:00.000Z',
          total_amount: 5000
        }]}
        updatingBookingId={null}
        onStatusChange={onStatusChange}
        emptyText="No appointments."
      />
    );

    const status = screen.getByRole('combobox', { name: 'Status for SVC-11' });
    expect([...status.options].map((option) => option.value)).toEqual(['confirmed', 'checked_in', 'cancelled', 'no_show']);
    fireEvent.change(status, { target: { value: 'checked_in' } });
    expect(onStatusChange).toHaveBeenCalledWith(11, 'checked_in');
  });

  it('renders explicit empty states for client and reminder panels', () => {
    const { rerender } = render(<ServiceClientsPanel clients={[]} loading={false} />);
    expect(screen.getByText('No service clients yet.')).toBeTruthy();

    rerender(<ServiceRemindersPanel reminders={[]} loading={false} saving="" onQueue={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByText('No reminders queued yet.')).toBeTruthy();
  });

  it('filters reminder outcomes and submits the selected queue window', () => {
    const onQueue = vi.fn();
    render(<ServiceRemindersPanel reminders={[
      { reminder_id: 1, recipient: 'sent@example.com', channel: 'email', reminder_type: 'appointment_reminder', status: 'sent', provider_message_id: 'mail-1', payload: { service_name: 'Laundry', public_reference: 'SVC-1' } },
      { reminder_id: 2, recipient: 'skipped@example.com', channel: 'email', reminder_type: 'appointment_reminder', status: 'skipped', failure_reason: 'email_not_configured', payload: { service_name: 'Pressing', public_reference: 'SVC-2' } }
    ]} loading={false} saving="" outcome={{ action: 'send-reminders', sent_count: 1, failed_count: 0, skipped_count: 1 }} onQueue={onQueue} onSend={vi.fn()} />);

    expect(screen.getByRole('status').textContent).toContain('1 sent · 0 failed · 1 skipped');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter reminders by status' }), { target: { value: 'skipped' } });
    expect(screen.getByText('skipped@example.com')).toBeTruthy();
    expect(screen.queryByText('sent@example.com')).toBeNull();
    expect(screen.getByText('email_not_configured')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Reminder queue window' }), { target: { value: '168' } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue Due' }));
    expect(onQueue).toHaveBeenCalledWith(168);
  });

  it('locks both reminder actions while busy and for view-only operators', () => {
    const { rerender } = render(<ServiceRemindersPanel reminders={[]} loading={false} saving="send-reminders" onQueue={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Queue Due' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Processing...' }).disabled).toBe(true);

    rerender(<ServiceRemindersPanel reminders={[]} loading={false} saving="" onQueue={vi.fn()} onSend={vi.fn()} canManage={false} />);
    expect(screen.getByText('View-only access: reminder queueing and delivery processing are disabled.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Queue Due' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Send Due' }).disabled).toBe(true);
  });

  it('keeps waitlist status mutations controlled by the parent surface', () => {
    const onStatusChange = vi.fn();
    render(
      <ServiceWaitlistPanel
        waitlistForm={{ service_item_id: '', customer_name: '', customer_email: '', customer_phone: '', preferred_start_at: '', preferred_end_at: '', notes: '' }}
        setWaitlistForm={vi.fn()}
        serviceOptions={[]}
        waitlist={[{ waitlist_entry_id: 5, customer_name: 'Maria', status: 'waiting', service: { name: 'Wash' } }]}
        saving=""
        loading={false}
        updatingWaitlistId={null}
        onSubmit={vi.fn()}
        onStatusChange={onStatusChange}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Waitlist status for Maria' }), { target: { value: 'notified' } });
    expect(onStatusChange).toHaveBeenCalledWith(5, 'notified');
  });

  it('sorts and filters waitlist entries while locking all status controls during an update', () => {
    render(
      <ServiceWaitlistPanel
        waitlistForm={{ service_item_id: '', customer_name: '', customer_email: '', customer_phone: '', preferred_start_at: '', preferred_end_at: '', notes: '' }}
        setWaitlistForm={vi.fn()}
        serviceOptions={[]}
        waitlist={[
          { waitlist_entry_id: 2, customer_name: 'Later Client', customer_phone: '222', status: 'waiting', preferred_start_at: '2026-08-12T10:00:00.000Z', service: { name: 'Pressing' } },
          { waitlist_entry_id: 1, customer_name: 'Sooner Client', customer_email: 'soon@example.com', status: 'notified', preferred_start_at: '2026-08-11T10:00:00.000Z', service: { name: 'Laundry' } }
        ]}
        saving=""
        loading={false}
        updatingWaitlistId={1}
        onSubmit={vi.fn()}
        onStatusChange={vi.fn()}
      />
    );

    const controls = screen.getAllByRole('combobox', { name: /^Waitlist status for/ });
    expect(controls.map((control) => control.getAttribute('aria-label'))).toEqual(['Waitlist status for Sooner Client', 'Waitlist status for Later Client']);
    expect(controls.every((control) => control.disabled)).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search waitlist' }), { target: { value: 'Pressing' } });
    expect(screen.getByText('Later Client')).toBeTruthy();
    expect(screen.queryByText('Sooner Client')).toBeNull();
  });

  it('filters client segments and orders clients by spend', () => {
    render(<ServiceClientsPanel clients={[
      { client_key: 'new', customer_name: 'New Client', booking_count: 1, completed_count: 0, no_show_count: 0, repeat_client: false, total_spend: 100, last_service_name: 'Pressing' },
      { client_key: 'repeat', customer_name: 'Repeat Client', booking_count: 4, completed_count: 3, no_show_count: 1, repeat_client: true, total_spend: 900, last_service_name: 'Laundry' }
    ]} loading={false} />);

    expect(screen.getAllByRole('row')[1].textContent).toContain('Repeat Client');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter client segment' }), { target: { value: 'new' } });
    expect(screen.getByText('New Client')).toBeTruthy();
    expect(screen.queryByText('Repeat Client')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search service clients' }), { target: { value: 'missing' } });
    expect(screen.getByText('No clients match the current filters.')).toBeTruthy();
  });

  it('shows complete resource and assignment anchors while disabling view-only mutations', () => {
    render(
      <ServiceTeamResourcesPanel
        resourceForm={{ name: '', resource_type: 'provider', capacity: 1, location_id: '' }}
        setResourceForm={vi.fn()}
        assignmentForm={{ item_id: '', resource_id: '', user_id: '', location_id: '' }}
        setAssignmentForm={vi.fn()}
        serviceOptions={[]}
        resources={[{ resource_id: 3, name: 'Room A', resource_type: 'room', capacity: 2, location_id: 4 }]}
        users={[]}
        assignments={[{ assignment_id: 8, item_id: 9, location_id: 4, service: { name: 'Massage' }, resource: { name: 'Room A' }, provider: { username: 'Ana' } }]}
        saving=""
        loading={false}
        onResourceSubmit={vi.fn()}
        onAssignmentSubmit={vi.fn()}
        onDeactivateAssignment={vi.fn()}
        canManage={false}
      />
    );

    expect(screen.getByText('View-only access: resource and assignment changes are disabled.')).toBeTruthy();
    expect(screen.getByText('Room A · Ana · Location #4')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove assignment for Massage' }).disabled).toBe(true);
  });
});
