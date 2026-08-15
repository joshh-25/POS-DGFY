/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SimpleTrackingCompletedView } from '../modes/simple/tracking/components/SimpleTrackingCompletedView.jsx';

afterEach(cleanup);

describe('SimpleTrackingCompletedView', () => {
  it('renders a responsive completed order summary for pickup', () => {
    const goStoreCatalogPage = vi.fn();
    render(
      <SimpleTrackingCompletedView
        actions={{ goStoreCatalogPage }}
        formatters={{
          formatTicketDate: () => 'Aug 15, 2026, 10:00 AM',
          money: (value) => `PHP ${Number(value || 0).toFixed(2)}`,
          servicesBodyFont: 'Arial',
          servicesDisplayFont: 'Arial'
        }}
        isMobileViewport
        viewModel={{
          branchAddress: 'Mandurriao, Iloilo City',
          branchName: 'Len2 Sari-Sari Store',
          dgfyBorder: '#E4C98E',
          dgfyPrimary: '#176B3A',
          isPickup: true,
          trackingResult: {
            tracking_pin: 'SK-TEST1234',
            updatedAt: '2026-08-15T10:00:00Z',
            items: [{ id: 1, name: 'Coca-Cola Sakto 290mL', qty: 2, amount: 40 }],
            subtotalAmount: 40,
            discountAmount: 5,
            discountLabel: 'Today\'s Promo',
            totalAmount: 35
          }
        }}
      />
    );

    expect(screen.getByTestId('simple-tracking-completed')).toBeTruthy();
    expect(screen.getByText('Pickup Completed')).toBeTruthy();
    expect(screen.getByText('Order Picked Up')).toBeTruthy();
    expect(screen.getByText('Today\'s Promo')).toBeTruthy();
    expect(screen.getByText('PHP 35.00')).toBeTruthy();
    screen.getByRole('button', { name: 'Order Again' }).click();
    expect(goStoreCatalogPage).toHaveBeenCalledTimes(1);
  });
});
