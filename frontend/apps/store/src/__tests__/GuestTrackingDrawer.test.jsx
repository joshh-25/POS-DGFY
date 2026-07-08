/* @vitest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  it('expands and collapses tracked orders through the array-based expanded state contract', async () => {
    const Wrapper = () => {
      const [expandedPins, setExpandedPins] = React.useState([]);
      return (
        <GuestTrackingDrawer
          isOpen
          isMobileViewport
          trackingPinInput=""
          onTrackingPinInputChange={() => {}}
          onTrack={() => {}}
          selectedStore={null}
          guestTrackedOrders={[buildOrder()]}
          trackingError=""
          expandedGuestDrawerPins={expandedPins}
          onExpandedGuestDrawerPinsChange={setExpandedPins}
          onClose={() => {}}
          openFullTrackingForPin={() => {}}
          withAssetOrigin={(value) => value}
          money={(value) => `PHP ${Number(value).toFixed(2)}`}
          formatTicketDate={() => 'Today'}
          getTrackingFlowForOrderMethod={() => 'pickup'}
          isAccountTracking
        />
      );
    };

    render(<Wrapper />);

    expect(screen.queryByText(/Products/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /space bar/i }));
    expect(screen.getByText(/Products/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /space bar/i }));
    expect(screen.queryByText(/Products/i)).toBeNull();
  });
});
