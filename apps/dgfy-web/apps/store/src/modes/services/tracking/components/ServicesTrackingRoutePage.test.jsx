/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServicesTrackingRoutePage } from './ServicesTrackingRoutePage.jsx';

describe('ServicesTrackingRoutePage', () => {
  afterEach(cleanup);

  it('renders persisted service lifecycle status and booking details', () => {
    render(
      <ServicesTrackingRoutePage
        actions={{ goStoreCatalogPage: vi.fn(), handleTrack: vi.fn(), money: (amount) => `PHP ${amount}`, setTrackingPinInput: vi.fn() }}
        catalog={[]}
        formatTicketDate={(value) => String(value)}
        isMobileViewport={false}
        isTrackingRefreshing={false}
        selectedStore={{ name: 'Ralph\'s Laundry' }}
        serviceHandoff="pickup"
        trackingError=""
        trackingPinInput="SV-ABC123"
        trackingResult={{
          booking: {
            created_at: '2026-08-12T08:00:00Z',
            quantity: 2,
            service_category: 'laundry',
            service_name: 'Wash, Dry & Fold',
            total_amount: 300
          },
          serviceName: 'Wash, Dry & Fold',
          status: 'in_service',
          tracking_pin: 'SV-ABC123'
        }}
        withAssetOrigin={(value) => value}
      />
    );

    const statusHeading = screen.getByRole('heading', { name: 'Service in progress' });
    expect(statusHeading).toBeTruthy();
    expect(statusHeading.style.fontFamily).toContain('Lexend');
    expect(statusHeading.style.fontFamily).toContain('Segoe UI');
    expect(screen.getAllByText('SV-ABC123').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Wash, Dry & Fold/)).toBeTruthy();
    expect(screen.getByText(/laundry/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pickup at' })).toBeTruthy();
    expect(screen.getByText("Pick up and I'll collect")).toBeTruthy();
  });

  it('renders the local drop-off and quote-style simulation timeline without appointment labels', () => {
    render(
      <ServicesTrackingRoutePage
        actions={{ advanceLocalSimulation: vi.fn(), copyTextToClipboard: vi.fn(), goStoreCatalogPage: vi.fn(), handleTrack: vi.fn(), money: (amount) => `PHP ${amount}`, setTrackingPinInput: vi.fn() }}
        catalog={[]}
        formatTicketDate={(value) => String(value)}
        isMobileViewport={false}
        isTrackingRefreshing={false}
        selectedStore={{ name: 'Ralph\'s Laundry' }}
        trackingError=""
        trackingPinInput="SV-LOCAL-DROPOFF"
        trackingResult={{
          booking: { service_name: 'Custom repair assessment', total_amount: null },
          items: [{ image_url: '/uploads/storefront-assets/comforter-care.webp', item_id: 12, name: 'Custom repair assessment' }],
          localSimulation: true,
          profile_key: 'item_dropoff_collection',
          serviceProfileKey: 'item_dropoff_collection',
          status: 'for_dropoff',
          tracking_pin: 'SV-LOCAL-DROPOFF'
        }}
        withAssetOrigin={(value) => value}
      />
    );

    expect(screen.getByRole('heading', { name: 'Ready for drop-off' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Custom repair assessment' }).getAttribute('src')).toBe('/uploads/storefront-assets/comforter-care.webp');
    expect(screen.queryByText(/Local preview only/)).toBeNull();
    expect(screen.queryByText('Live updates')).toBeNull();
    expect(screen.queryByText('Your safety matters')).toBeNull();
    expect(screen.queryByText('Top-rated support')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Drop-off at' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Advance local preview' })).toBeNull();
  });
});
