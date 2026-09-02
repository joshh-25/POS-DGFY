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
    expect(statusHeading.style.fontFamily).toContain('Outfit');
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
        isMobileViewport
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
    const timeline = screen.getByRole('region', { name: 'Service status timeline' });
    expect(timeline.style.display).toBe('grid');
    expect(timeline.style.gridTemplateColumns).toBe('repeat(7, minmax(0, 1fr))');
    expect(timeline.style.overflowX).toBe('hidden');
    expect(timeline.querySelector('[aria-current="step"]')).toBeTruthy();
    expect(screen.queryByText('Updated')).toBeNull();
    expect(screen.queryByText(/Local preview only/)).toBeNull();
    expect(screen.queryByText('Live updates')).toBeNull();
    expect(screen.queryByText('Your safety matters')).toBeNull();
    expect(screen.queryByText('Top-rated support')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Drop-off at' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Advance local preview' })).toBeNull();
  });

  it('keeps the service amount on the item heading row on mobile', () => {
    render(
      <ServicesTrackingRoutePage
        actions={{ copyTextToClipboard: vi.fn(), goStoreCatalogPage: vi.fn(), handleTrack: vi.fn(), money: (amount) => `PHP ${amount}`, setTrackingPinInput: vi.fn() }}
        catalog={[]}
        formatTicketDate={(value) => String(value)}
        isMobileViewport
        isTrackingRefreshing={false}
        selectedStore={{ name: 'Ralph\'s Laundry' }}
        trackingError=""
        trackingPinInput="SV-MOBILE-PRICE"
        trackingResult={{
          booking: { quantity: 1, service_name: 'Comforter Care', total_amount: 2247.25 },
          serviceName: 'Comforter Care',
          status: 'confirmed',
          tracking_pin: 'SV-MOBILE-PRICE'
        }}
      />
    );

    const serviceItem = screen.getByTestId('tracking-service-item');
    const amount = screen.getByTestId('tracking-service-item-amount');

    expect(serviceItem.style.gridTemplateColumns).toBe('58px minmax(0, 1fr)');
    expect(amount.textContent).toBe('PHP 2247.25');
    expect(amount.style.fontSize).toBe('13px');
    expect(amount.style.whiteSpace).toBe('nowrap');
  });

  it('renders every service in a multi-service tracking result', () => {
    render(
      <ServicesTrackingRoutePage
        actions={{ copyTextToClipboard: vi.fn(), goStoreCatalogPage: vi.fn(), handleTrack: vi.fn(), money: (amount) => `PHP ${amount}`, setTrackingPinInput: vi.fn() }}
        catalog={[]}
        formatTicketDate={(value) => String(value)}
        isMobileViewport={false}
        isTrackingRefreshing={false}
        selectedStore={{ name: 'Ralph\'s AC Solutions' }}
        trackingError=""
        trackingPinInput="SV-MULTI-1"
        trackingResult={{
          booking: { created_at: '2026-09-02T08:00:00Z', total_amount: 4750 },
          items: [
            { amount: 1000, item_id: 101, name: 'Aircon Check-up', qty: 1, unit_of_measure: 'Standard service' },
            { amount: 1200, item_id: 102, name: 'Aircon Cleaning · Split Type', qty: 1, unit_of_measure: 'Standard service' },
            { amount: 1500, item_id: 103, name: 'Aircon Cleaning · Window Type', qty: 1, unit_of_measure: 'Standard service' },
            { amount: 1050, item_id: 104, name: 'Repair Assessment', qty: 1, unit_of_measure: 'Standard service' }
          ],
          status: 'requested',
          totalAmount: 4750,
          tracking_pin: 'SV-MULTI-1'
        }}
      />
    );

    expect(screen.getAllByTestId('tracking-service-item')).toHaveLength(4);
    expect(screen.getByText('Aircon Check-up')).toBeTruthy();
    expect(screen.getByText('Aircon Cleaning · Split Type')).toBeTruthy();
    expect(screen.getByText('Aircon Cleaning · Window Type')).toBeTruthy();
    expect(screen.getByText('Repair Assessment')).toBeTruthy();
    expect(screen.getAllByTestId('tracking-service-item-amount').map((element) => element.textContent)).toEqual([
      'PHP 1000',
      'PHP 1200',
      'PHP 1500',
      'PHP 1050'
    ]);
  });
});
