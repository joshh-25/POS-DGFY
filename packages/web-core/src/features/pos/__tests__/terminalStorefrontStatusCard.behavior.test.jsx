/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalStorefrontStatusCard, { getStorefrontHoursStatus } from '../components/TerminalStorefrontStatusCard.jsx';
import { createDefaultStorefrontBusinessHours } from '../../settings/storefrontBusinessHours.js';

describe('TerminalStorefrontStatusCard', () => {
  afterEach(() => cleanup());

  it('shows the selected branch, current service status, channels, and Back Office action', async () => {
    const user = userEvent.setup();
    const onOpenBackOffice = vi.fn();
    const now = new Date('2026-09-14T02:00:00.000Z');

    render(
      <TerminalStorefrontStatusCard
        storefrontHours={createDefaultStorefrontBusinessHours()}
        storefrontLocations={[{
          location_id: 7,
          name: 'Masu Cafe',
          is_active: true,
          is_open: true,
          supports_pickup: true,
          supports_delivery: true,
          supports_dine_in: false
        }]}
        locationId={7}
        storeIsVisible
        customerAccessMode="transaction"
        isOnline
        canOpenBackOffice
        onOpenBackOffice={onOpenBackOffice}
        now={now}
      />
    );

    expect(screen.getByTestId('pos-terminal-storefront-status-badge').textContent).toContain('Open now');
    expect(screen.getByText('Masu Cafe')).toBeTruthy();
    expect(screen.getByText('Orders enabled')).toBeTruthy();
    expect(screen.getByText('Pickup')).toBeTruthy();
    expect(screen.getByText('Delivery')).toBeTruthy();

    await user.click(screen.getByTestId('pos-terminal-storefront-manage'));
    expect(onOpenBackOffice).toHaveBeenCalledWith({ path: '/backoffice/settings/storefront' });
  });

  it('reports closed hours and hidden Storefront state without an assigned branch', () => {
    const now = new Date('2026-09-13T04:00:00.000Z');
    const snapshot = getStorefrontHoursStatus(createDefaultStorefrontBusinessHours(), now);

    expect(snapshot.dayKey).toBe('sun');
    expect(snapshot.isOpen).toBe(false);

    render(
      <TerminalStorefrontStatusCard
        storefrontHours={snapshot.schedule}
        storefrontLocations={[]}
        storeIsVisible={false}
        customerAccessMode="catalog"
        canOpenBackOffice={false}
        now={now}
      />
    );

    expect(screen.getByTestId('pos-terminal-storefront-status-badge').textContent).toContain('Not published');
    expect(screen.getByText('Managed by your account admin')).toBeTruthy();
  });

  it('supports the Admin presentation without exposing a second navigation action', () => {
    render(
      <TerminalStorefrontStatusCard
        storefrontHours={createDefaultStorefrontBusinessHours()}
        storefrontLocations={[{ location_id: 7, name: 'Masu Cafe', is_active: true, is_open: true }]}
        locationId={7}
        storeIsVisible
        customerAccessMode="transaction"
        canOpenBackOffice={false}
        description="Live summary of Storefront settings."
        managementMessage="You are editing the canonical Storefront settings."
      />
    );

    expect(screen.getByText('Live summary of Storefront settings.')).toBeTruthy();
    expect(screen.getByText('You are editing the canonical Storefront settings.')).toBeTruthy();
    expect(screen.queryByTestId('pos-terminal-storefront-manage')).toBeNull();
  });
});
