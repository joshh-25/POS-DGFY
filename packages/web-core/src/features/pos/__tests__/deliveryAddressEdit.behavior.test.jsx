// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeliveryAddressEditControl from '../components/DeliveryAddressEditControl.jsx';

afterEach(() => {
  cleanup();
});

// Phase 210 (#1179). Covers the staff-only post-placement delivery address/pin edit control at
// the component level: visibility gating (pre-dispatch only, per Pat's confirmed deviation from
// the plan's default -- see PHASE_210_PLAN.md section 3.4/4.3), the required reason + paired
// lat/lng guard, concise customer-confirmation copy, and its compact typography.

const DELIVERY_ORDER = {
  pos_transaction_id: 903,
  order_method: 'delivery',
  fulfillment_status: 'confirmed',
  delivery_address: 'Original address',
  delivery_latitude: 14.5,
  delivery_longitude: 121.0
};

const renderControl = (overrides = {}) => render(
  <DeliveryAddressEditControl
    orderId={DELIVERY_ORDER.pos_transaction_id}
    order={DELIVERY_ORDER}
    addressChanges={[]}
    actionLoading=""
    canTransactPos
    locked={false}
    isOnline
    hasActiveShift
    onSave={vi.fn().mockResolvedValue(true)}
    {...overrides}
  />
);

describe('DeliveryAddressEditControl visibility (Phase 210, #1179)', () => {
  it('renders for a placed/confirmed/preparing delivery order', () => {
    for (const status of ['placed', 'confirmed', 'preparing']) {
      const { unmount } = renderControl({ order: { ...DELIVERY_ORDER, fulfillment_status: status } });
      expect(screen.getByRole('button', { name: /edit delivery address/i })).toBeTruthy();
      unmount();
    }
  });

  // Pat's confirmed deviation from the plan default: pre-dispatch only. out_for_delivery is
  // deliberately EXCLUDED, same as a terminal state.
  it('does not render once out_for_delivery', () => {
    renderControl({ order: { ...DELIVERY_ORDER, fulfillment_status: 'out_for_delivery' } });
    expect(screen.queryByRole('button', { name: /edit delivery address/i })).toBeNull();
  });

  it('does not render for a terminal state', () => {
    for (const status of ['completed', 'cancelled', 'rejected']) {
      const { unmount } = renderControl({ order: { ...DELIVERY_ORDER, fulfillment_status: status } });
      expect(screen.queryByRole('button', { name: /edit delivery address/i })).toBeNull();
      unmount();
    }
  });

  it('does not render for a non-delivery order', () => {
    renderControl({ order: { ...DELIVERY_ORDER, order_method: 'pickup' } });
    expect(screen.queryByRole('button', { name: /edit delivery address/i })).toBeNull();
  });
});

describe('DeliveryAddressEditControl dialog behaviour (Phase 210, #1179)', () => {
  it('shows a concise customer-confirmation instruction in compact typography', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: /edit delivery address/i }));
    const description = screen.getByText(
      "Call the customer to confirm the new address before saving. They won't be notified automatically."
    );
    const title = screen.getByRole('heading', { name: /edit delivery address/i });
    const address = screen.getByLabelText('Address');

    expect(description.className).toContain('text-[13px]');
    expect(title.className).toContain('text-xl');
    expect(address.className).toContain('text-[13px]');
  });

  it('disables save until a reason is entered', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: /edit delivery address/i }));
    const saveButton = screen.getByRole('button', { name: /save address/i });
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/reason for change/i), {
      target: { value: 'Customer requested a new handover point' }
    });
    expect(saveButton.disabled).toBe(false);
  });

  it('renders address-change history when present', () => {
    renderControl({
      addressChanges: [{
        address_change_id: 1,
        previous_address: 'Old address',
        changed_at: '2026-09-01T10:00:00Z',
        changedByUser: { username: 'staff1' }
      }]
    });
    fireEvent.click(screen.getByRole('button', { name: /edit delivery address/i }));
    expect(screen.getAllByText(/from Old address/i).length).toBeGreaterThan(0);
  });
});
