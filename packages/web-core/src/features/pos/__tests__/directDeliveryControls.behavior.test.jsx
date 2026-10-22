/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeliveryAssignmentControl from '../components/DeliveryAssignmentControl.jsx';
import DeliveryCompletionDialog from '../components/DeliveryCompletionDialog.jsx';

const baseAssignmentProps = {
  orderId: 44,
  deliveryJob: { provider: 'manual', status: 'pending_dispatch' },
  directDelivery: true,
  canAssignOrder: true,
  canTransactPos: true,
  isOnline: true,
  hasActiveShift: true,
  onAssign: vi.fn()
};

afterEach(() => cleanup());

describe('direct delivery controls', () => {
  it('allows assignment to a third-party service before a rider is named', () => {
    const onAssign = vi.fn();
    render(<DeliveryAssignmentControl {...baseAssignmentProps} onAssign={onAssign} />);

    const assign = screen.getByRole('button', { name: 'Assign rider' });
    expect(assign.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Lalamove'));
    expect(assign.disabled).toBe(false);
    fireEvent.click(assign);

    expect(onAssign).toHaveBeenCalledWith(44, expect.objectContaining({ courier_service: 'lalamove' }));
    expect(onAssign.mock.calls[0][1]).not.toHaveProperty('name');
  });

  it('requires an Other courier name and HTTPS tracking links', () => {
    render(<DeliveryAssignmentControl {...baseAssignmentProps} />);
    const assign = screen.getByRole('button', { name: 'Assign rider' });

    fireEvent.click(screen.getByLabelText('Other'));
    expect(assign.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Other courier company'), { target: { value: 'City Courier' } });
    expect(assign.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Courier tracking link'), { target: { value: 'http://example.com/track' } });
    expect(assign.disabled).toBe(true);
  });

  it('maps an existing registered rider without courier metadata to Own', () => {
    render(<DeliveryAssignmentControl
      {...baseAssignmentProps}
      deliveryJob={{ ...baseAssignmentProps.deliveryJob, delivery_personnel_id: 21 }}
      deliveryPersonnelState={{ personnel: [{ delivery_personnel_id: 21, display_name: 'Jane Rider', is_active: true }] }}
    />);

    expect(screen.getByLabelText('Own').checked).toBe(true);
  });

  it('accepts a typed rider name for Own and locks assignment after pickup', () => {
    const onAssign = vi.fn();
    const { rerender } = render(<DeliveryAssignmentControl
      {...baseAssignmentProps}
      deliveryPersonnelState={{ personnel: [{ delivery_personnel_id: 21, display_name: 'Jane Rider', is_active: true }] }}
      onAssign={onAssign}
    />);
    fireEvent.click(screen.getByLabelText('Own'));
    const rider = screen.getByLabelText('Delivery personnel for order 44');
    fireEvent.change(rider, { target: { value: 'Jane Rider' } });
    const assign = screen.getByRole('button', { name: 'Assign rider' });
    expect(assign.disabled).toBe(false);
    fireEvent.click(assign);
    expect(onAssign).toHaveBeenCalledWith(44, expect.objectContaining({ id: 21, courier_service: 'own' }));

    fireEvent.change(rider, { target: { value: 'Temporary rider' } });
    fireEvent.click(assign);
    expect(onAssign).toHaveBeenLastCalledWith(44, expect.objectContaining({ name: 'Temporary rider', courier_service: 'own' }));

    rerender(<DeliveryAssignmentControl
      {...baseAssignmentProps}
      deliveryJob={{
        ...baseAssignmentProps.deliveryJob, status: 'picked_up', courier_service: 'own',
        delivery_personnel_id: 21, assigned_by: 12, assigned_shift_id: 9, assigned_at: '2026-10-22T10:00:00Z'
      }}
    />);
    expect(screen.queryByRole('button', { name: 'Assign rider' })).toBeNull();
    expect(screen.getByText(/locked after pickup starts/i)).toBeTruthy();
  });

  it('requires cash coverage and submits settlement before Delivered', () => {
    const onSubmit = vi.fn();
    const onCashInputChange = vi.fn();
    const props = {
      order: { payment_status: 'partially_paid', balance_due: 25, total_amount: 100 },
      method: 'cash',
      cashInput: '20',
      onSubmit,
      onCashInputChange
    };
    const { rerender } = render(<DeliveryCompletionDialog {...props} />);

    const confirm = screen.getByRole('button', { name: 'Confirm Delivered' });
    expect(screen.getByText('Amount due: ₱25.00')).toBeTruthy();
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Cash received'), { target: { value: '30' } });
    expect(onCashInputChange).toHaveBeenCalledWith('30');
    rerender(<DeliveryCompletionDialog {...props} cashInput="30" />);
    const updatedConfirm = screen.getByRole('button', { name: 'Confirm Delivered' });
    expect(updatedConfirm.disabled).toBe(false);
    fireEvent.click(updatedConfirm);
    expect(onSubmit).toHaveBeenCalledWith({ method: 'cash', amount: 30, manual_payment_received: undefined });
  });

  it('requires an explicit received-payment confirmation for a digital balance', () => {
    const onSubmit = vi.fn();
    const onConfirmedChange = vi.fn();
    const props = {
      order: { payment_status: 'partially_paid', balance_due: 25, total_amount: 100 },
      method: 'gcash',
      onSubmit,
      onConfirmedChange
    };
    const { rerender } = render(<DeliveryCompletionDialog {...props} />);
    const confirm = screen.getByRole('button', { name: 'Confirm Delivered' });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('I confirm the store received this payment.'));
    expect(onConfirmedChange).toHaveBeenCalledWith(true);
    rerender(<DeliveryCompletionDialog {...props} confirmed />);
    const updatedConfirm = screen.getByRole('button', { name: 'Confirm Delivered' });
    expect(updatedConfirm.disabled).toBe(false);
    fireEvent.click(updatedConfirm);
    expect(onSubmit).toHaveBeenCalledWith({ method: 'gcash', amount: 25, manual_payment_received: true });

    rerender(<DeliveryCompletionDialog
      order={{ payment_status: 'unpaid', balance_due: 0, total_amount: 100 }}
      method="cash"
      cashInput="100"
      onSubmit={onSubmit}
    />);
    expect(screen.getByLabelText('Payment method').disabled).toBe(true);
  });
});
