/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuestTrackingDrawer } from '../tracking/components/GuestTrackingDrawer.jsx';

const buildOrder = (overrides = {}) => ({
  tracking_pin: 'SK-123456',
  status_label: 'Order placed',
  store_name: 'Space Bar',
  total_amount: 111.1,
  created_at: '2026-07-06T06:59:00.000Z',
  items: [
    { name: 'Latte', qty: 1, amount: 111.1 }
  ],
  ...overrides
});

describe('GuestTrackingDrawer', () => {
  afterEach(() => cleanup());

  const renderDrawer = (overrides = {}) => render(
    <GuestTrackingDrawer
      isOpen
      isMobileViewport
      selectedStore={null}
      guestTrackedOrders={[buildOrder()]}
      onClose={() => {}}
      openFullTrackingForPin={() => {}}
      withAssetOrigin={(value) => value}
      money={(value) => `PHP ${Number(value).toFixed(2)}`}
      isAccountTracking
      {...overrides}
    />
  );

  it('renders compact, single-action order cards without expansion controls', () => {
    const openFullTrackingForPin = vi.fn();
    renderDrawer({ openFullTrackingForPin });

    expect(screen.queryByText(/Products/i)).toBeNull();
    expect(screen.queryByText(/Total Amount/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /view order details/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /open space bar order sk-123456/i }));
    expect(openFullTrackingForPin).toHaveBeenCalledWith('SK-123456');
  });

  it('closes from the visible close control', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters saved orders by store name and tracks an unsaved PIN on submit', () => {
    const openFullTrackingForPin = vi.fn();
    renderDrawer({
      openFullTrackingForPin,
      guestTrackedOrders: [
        buildOrder(),
        buildOrder({ tracking_pin: 'SK-654321', store_name: 'Digi Store' })
      ]
    });

    const search = screen.getByRole('textbox', { name: /search orders by order pin or store name/i });
    fireEvent.change(search, { target: { value: 'Digi Store' } });
    expect(screen.queryByRole('button', { name: /open space bar order sk-123456/i })).toBeNull();
    expect(screen.getByRole('button', { name: /open digi store order sk-654321/i })).toBeTruthy();

    fireEvent.change(search, { target: { value: 'SK-999999' } });
    fireEvent.submit(search.closest('form'));
    expect(openFullTrackingForPin).toHaveBeenCalledWith('SK-999999');
    expect(screen.getByRole('status').textContent).toMatch(/no matching active orders/i);
  });
});
