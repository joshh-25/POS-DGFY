// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OnlineOrderReceiptModal from '../components/OnlineOrderReceiptModal.jsx';

afterEach(() => cleanup());

// #1319: the delivery receipt printed during handoff reuses this exact modal (ADR 0045's shared
// renderer contract) -- these assertions cover the acceptance criteria without forking a second
// document type.

const baseOrder = {
  pos_transaction_id: 501,
  order_method: 'delivery',
  fulfillment_status: 'out_for_delivery',
  invoice_number: 'INV-501',
  customer_name: 'Juana Dela Cruz',
  delivery_address: '123 Mabini St, Quezon City',
  payment_type: 'cash',
  payment_status: 'unpaid',
  subtotal_amount: 500,
  total_amount: 550,
  lines: []
};

describe('OnlineOrderReceiptModal delivery handoff (#1319)', () => {
  it('renders merchant identity from businessSettings', () => {
    render(
      <OnlineOrderReceiptModal
        open
        order={baseOrder}
        onPrint={vi.fn()}
        businessSettings={{
          pos_registered_name: 'Sieitzz Foods Corp.',
          pos_business_name: 'Juana\'s Kitchen',
          pos_address: '456 Quezon Ave, Quezon City'
        }}
      />
    );

    expect(screen.getByText('Sieitzz Foods Corp.')).toBeDefined();
    expect(screen.getByText("Juana's Kitchen")).toBeDefined();
    expect(screen.getByText('456 Quezon Ave, Quezon City')).toBeDefined();
  });

  it('suppresses the brand business name when businessSettings still reads the DGFY default', () => {
    render(
      <OnlineOrderReceiptModal
        open
        order={baseOrder}
        onPrint={vi.fn()}
        businessSettings={{ pos_registered_name: 'Sieitzz Foods Corp.', pos_business_name: 'DGFY' }}
      />
    );

    expect(screen.queryByText('DGFY')).toBeNull();
  });

  it('renders the assigned registered delivery person and run label', () => {
    render(
      <OnlineOrderReceiptModal
        open
        order={{
          ...baseOrder,
          deliveryJob: {
            status: 'picked_up',
            deliveryPersonnel: { display_name: 'Mark Rider' },
            deliveryRun: { label: 'Run A' }
          }
        }}
        onPrint={vi.fn()}
      />
    );

    expect(screen.getByText('Picked Up')).toBeDefined();
    expect(screen.getByText('Mark Rider')).toBeDefined();
    expect(screen.getByText('Run A')).toBeDefined();
  });

  it('renders a typed third-party courier name when no registered personnel is set', () => {
    render(
      <OnlineOrderReceiptModal
        open
        order={{
          ...baseOrder,
          deliveryJob: { status: 'assigned', delivery_personnel_name: 'Lalamove Courier' }
        }}
        onPrint={vi.fn()}
      />
    );

    expect(screen.getByText('Lalamove Courier')).toBeDefined();
  });

  it('renders an explicit not-yet-assigned state instead of a blank field', () => {
    render(
      <OnlineOrderReceiptModal
        open
        order={{ ...baseOrder, deliveryJob: { status: 'pending_dispatch' } }}
        onPrint={vi.fn()}
      />
    );

    expect(screen.getByText('Pending Dispatch')).toBeDefined();
    expect(screen.getByText('Not yet assigned')).toBeDefined();
  });

  it('omits the delivery run row when the order is not a run member', () => {
    render(
      <OnlineOrderReceiptModal
        open
        order={{ ...baseOrder, deliveryJob: { status: 'assigned', delivery_personnel_name: 'Courier' } }}
        onPrint={vi.fn()}
      />
    );

    expect(screen.queryByText('Delivery Run')).toBeNull();
  });

  it('keeps the non-fiscal posture unchanged (#842)', () => {
    render(
      <OnlineOrderReceiptModal
        open
        order={{ ...baseOrder, deliveryJob: { status: 'assigned', delivery_personnel_name: 'Courier' } }}
        onPrint={vi.fn()}
      />
    );

    expect(screen.getAllByText(/Non-Fiscal Order Receipt/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a fiscal receipt/i)).toBeDefined();
  });
});
