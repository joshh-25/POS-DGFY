// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorefrontTrackingOrderSummary } from './StorefrontTrackingOrderSummary.jsx';

afterEach(cleanup);

const renderSummary = (trackingResult) => render(
  <StorefrontTrackingOrderSummary
    accentColor="#1A4E8D"
    formatTicketDate={(value) => `formatted ${value}`}
    money={(value) => `₱${Number(value).toFixed(2)}`}
    onCopyPin={vi.fn()}
    statusLabel="Order confirmed"
    trackingResult={trackingResult}
  />
);

describe('StorefrontTrackingOrderSummary', () => {
  it('shows the scheduled service time from the public tracking order payload', () => {
    renderSummary({
      order_method: 'dine_in',
      order: { scheduled_for: '2026-09-27T14:30:00.000Z' }
    });

    expect(screen.getByText('Scheduled for')).toBeTruthy();
    expect(screen.getByText('formatted 2026-09-27T14:30:00.000Z')).toBeTruthy();
    expect(screen.queryByText('Order time')).toBeNull();
  });

  it('keeps the order-created timestamp label for unscheduled orders', () => {
    renderSummary({ createdAt: '2026-09-26T10:00:00.000Z', order_method: 'pickup' });

    expect(screen.getByText('Order time')).toBeTruthy();
    expect(screen.getByText('formatted 2026-09-26T10:00:00.000Z')).toBeTruthy();
  });

  it('renders discount and inclusive-VAT rows without exposing the legacy fee', () => {
    renderSummary({
      order_method: 'delivery',
      subtotalAmount: 119.62,
      discountAmount: 10,
      discountLabel: 'Weekend offer',
      deliveryFee: 0,
      serviceFeeAmount: 1.2,
      serviceFeeLabel: 'DGFY convenience fee',
      vatAmount: 12.82,
      totalAmount: 110.82,
    });

    expect(screen.getByText('Weekend offer')).toBeTruthy();
    expect(screen.getByText('- ₱10.00')).toBeTruthy();
    expect(screen.getByText('Delivery fee')).toBeTruthy();
    expect(screen.queryByText('DGFY convenience fee')).toBeNull();
    expect(screen.getByText('VAT (included in item prices)')).toBeTruthy();
    expect(screen.getByText('VAT shown above is already included in item prices and is calculated before any promo or voucher discount.')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('does not show a delivery-fee row on pickup orders', () => {
    renderSummary({ order_method: 'pickup', subtotalAmount: 100, deliveryFee: 15, totalAmount: 100 });

    expect(screen.queryByText('Delivery fee')).toBeNull();
  });
});
