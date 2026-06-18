// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DgfyCustomerAccountPage } from '../Components/storefront/pages/DgfyCustomerAccountPage.jsx';

const accountPanel = {
  me: {
    phone: '+639108617987',
    email: 'katecollin210@gmail.com',
    is_email_verified: true
  },
  orders: [
    {
      activity_id: 'order-1',
      reference: 'SK-M3SGQA',
      store_name: 'Space Bar',
      occurred_at: '2026-06-17T08:00:00Z',
      total_amount: 170.69,
      status: 'placed',
      status_label: 'Placed',
      allowed_actions: { cancel: true, reorder: true }
    },
    {
      activity_id: 'order-2',
      reference: 'SK-E5MJMP',
      store_name: 'Space Bar',
      occurred_at: '2026-06-17T09:00:00Z',
      total_amount: 251.49,
      status: 'confirmed',
      status_label: 'Confirmed',
      allowed_actions: { cancel: true, reorder: true }
    }
  ],
  bookings: [],
  addresses: [
    {
      address_id: 'addr-1',
      label: 'Home',
      address_line: 'Atria Park District, Mandurriao, Iloilo City',
      is_default: true
    },
    {
      address_id: 'addr-2',
      label: 'Office',
      address_line: 'Iloilo Business Park',
      is_default: false
    }
  ],
  loyalty: {
    balance: 8,
    transactions: []
  },
  businessCompanies: []
};

const renderDashboard = (props = {}) => render(
  <DgfyCustomerAccountPage
    isMobileViewport={false}
    presentation="page"
    onClose={vi.fn()}
    onRefresh={vi.fn()}
    onTrackReference={vi.fn()}
    onSignOut={vi.fn()}
    onHelp={vi.fn()}
    onRegisterBusiness={vi.fn()}
    accountIdentityInitials="SP"
    accountIdentityName="Sam Paul"
    accountIdentityContact="+639108617987 | katecollin210@gmail.com"
    accountPanel={accountPanel}
    activeOrders={accountPanel.orders}
    activeOrderCount={accountPanel.orders.length}
    {...props}
  />
);

afterEach(() => {
  cleanup();
});

describe('DGFY customer account dashboard', () => {
  it('renders the PR dashboard overview on the desktop page route without dropping hardened account data', () => {
    renderDashboard();

    expect(screen.getByText('Back to Discovery')).toBeTruthy();
    expect(screen.getAllByText('Sam Paul').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Grow your business')).toBeTruthy();
    expect(screen.getByText('Past Orders')).toBeTruthy();
    expect(screen.getByText('Loyalty Points')).toBeTruthy();
    expect(screen.getByText('Default Address')).toBeTruthy();
    expect(screen.getByText('Atria Park District, Mandurriao, Iloilo City')).toBeTruthy();
    expect(screen.getByText('Quick Actions')).toBeTruthy();
    expect(screen.getByText('Reorder Items')).toBeTruthy();
    expect(screen.getByText('Update Profile')).toBeTruthy();
  });

  it('renders the PR orders list with total, status, tracking, and receipt actions', () => {
    const onTrackReference = vi.fn();
    renderDashboard({ onTrackReference });

    fireEvent.click(screen.getByRole('button', { name: 'Orders' }));

    expect(screen.getByRole('heading', { name: 'Orders' })).toBeTruthy();
    expect(screen.getByText('PHP 170.69')).toBeTruthy();
    expect(screen.getByText('PHP 251.49')).toBeTruthy();
    expect(screen.getByText('Placed')).toBeTruthy();
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'View Receipt' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Track' })[0]);
    expect(onTrackReference).toHaveBeenCalledTimes(1);
    expect(onTrackReference.mock.calls[0][0]).toMatchObject({ reference: 'SK-M3SGQA' });
  });
});
