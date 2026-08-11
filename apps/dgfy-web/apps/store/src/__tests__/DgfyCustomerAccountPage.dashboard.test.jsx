// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DgfyCustomerAccountPage } from '../customer-dashboard/pages/DgfyCustomerAccountPage.jsx';

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
  businessCompanies: [
    {
      membership_id: 'membership-1',
      tenant_id: 'tenant-1',
      company_name: 'Space Bar',
      membership_status: 'accepted',
      tenant_status: 'active',
      is_owner: true,
      category_label: 'Food & Beverage',
      address_line: 'Megaworld Boulevard, Iloilo Business Park',
      storefront_cover_image_url: '/uploads/storefront-assets/space/cover.png',
      storefront_profile_image_url: '/uploads/storefront-assets/space/profile.png'
    }
  ]
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
    resolveBusinessAssetUrl={(value) => value}
    onOpenBusinessPos={vi.fn()}
    onGetBusinessDayCloseStatus={vi.fn().mockResolvedValue({ canCloseDay: true, pinConfigured: false })}
    onConfigureBusinessDayClosePin={vi.fn().mockResolvedValue(undefined)}
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
    expect(screen.getAllByRole('button', { name: 'View Order' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Track Order' })[0]);
    expect(onTrackReference).toHaveBeenCalledTimes(1);
    expect(onTrackReference.mock.calls[0][0]).toMatchObject({ reference: 'SK-M3SGQA' });
  });

  it('accepts a pending DGFY cashier invitation without requesting an OTP', async () => {
    const onAcceptCompanyInvitation = vi.fn().mockResolvedValue({ success: true });
    const onRequestBusinessStepUp = vi.fn();
    renderDashboard({
      onAcceptCompanyInvitation,
      onRequestBusinessStepUp,
      accountPanel: {
        ...accountPanel,
        businessCompanies: [{
          membership_id: 'membership-cashier',
          tenant_id: 'tenant-cashier',
          company_name: 'Cashier Company',
          status: 'pending',
          requires_action: 'accept_invitation'
        }]
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Business Premium' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(onAcceptCompanyInvitation).toHaveBeenCalledWith({ membershipId: 'membership-cashier', emailOtpCode: '' }));
    expect(onRequestBusinessStepUp).not.toHaveBeenCalled();
    expect(screen.queryByText('Email security check')).toBeNull();
  });

  it('shows the actual membership role on accepted business cards', () => {
    renderDashboard({
      accountPanel: {
        ...accountPanel,
        businessCompanies: [
          accountPanel.businessCompanies[0],
          {
            membership_id: 'membership-cashier',
            tenant_id: 'tenant-cashier',
            company_name: 'Cashier Company',
            membership_status: 'accepted',
            tenant_status: 'active',
            role: 'cashier'
          }
        ]
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Business Premium' }));

    expect(screen.getByText('Business Owner')).toBeTruthy();
    expect(screen.getByText('Cashier')).toBeTruthy();
  });

  it('sets a Day Close PIN directly in the selected business dialog without opening POS', async () => {
    const onConfigureBusinessDayClosePin = vi.fn().mockResolvedValue(undefined);
    const onGetBusinessDayCloseStatus = vi.fn().mockResolvedValue({ canCloseDay: true, pinConfigured: false });
    renderDashboard({ onConfigureBusinessDayClosePin, onGetBusinessDayCloseStatus });

    fireEvent.click(screen.getByRole('button', { name: 'Business Premium' }));
    fireEvent.click(screen.getByRole('button', { name: 'Day Close' }));

    expect(await screen.findByRole('heading', { name: 'Day Close' })).toBeTruthy();
    expect(screen.getByText('You are authorized. Set your personal PIN to confirm Z-readings.')).toBeTruthy();
    expect(screen.queryByText('Open DGFY POS?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Set my PIN' }).disabled).toBe(true);
    expect(screen.getByLabelText('Current account password').getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show current account password' }));
    expect(screen.getByLabelText('Current account password').getAttribute('type')).toBe('text');
    expect(screen.getByLabelText('New Day Close PIN').getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show new day close pin' }));
    expect(screen.getByLabelText('New Day Close PIN').getAttribute('type')).toBe('text');
    fireEvent.change(screen.getByLabelText('Current account password'), { target: { value: 'current-password' } });
    expect(screen.getByLabelText('Current account password').value).toBe('current-password');
    fireEvent.change(screen.getByLabelText('New Day Close PIN'), { target: { value: '1234' } });
    expect(screen.getByRole('button', { name: 'Set my PIN' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Confirm new PIN'), { target: { value: '1234' } });
    expect(screen.getByRole('button', { name: 'Set my PIN' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Set my PIN' }));

    await waitFor(() => expect(onConfigureBusinessDayClosePin).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'tenant-1' }),
      { currentPassword: 'current-password', pin: '1234' }
    ));
  });

  it('explains that manager authorization is required before a cashier can set a Day Close PIN', async () => {
    const onGetBusinessDayCloseStatus = vi.fn().mockResolvedValue({ canCloseDay: false, pinConfigured: false });
    renderDashboard({ onGetBusinessDayCloseStatus });

    fireEvent.click(screen.getByRole('button', { name: 'Business Premium' }));
    fireEvent.click(screen.getByRole('button', { name: 'Day Close' }));

    expect((await screen.findByRole('status')).textContent).toContain('Your manager must enable Can close day and generate Z-reading before you can create a PIN.');
    expect(screen.queryByLabelText('Current account password')).toBeNull();
    expect(screen.queryByLabelText('New Day Close PIN')).toBeNull();
  });

  it('opens notifications, marks single entries read, and marks all entries read', () => {
    const onTrackReference = vi.fn();
    const onMarkNotificationRead = vi.fn();
    const onMarkAllNotificationsRead = vi.fn();
    renderDashboard({
      onTrackReference,
      onMarkNotificationRead,
      onMarkAllNotificationsRead,
      accountPanel: {
        ...accountPanel,
        notifications: [
          {
            notification_id: 77,
            title: 'Order confirmed',
            body: 'Space Bar confirmed your order.',
            reference: 'SK-M3SGQA',
            status: 'confirmed',
            read_at: null
          }
        ],
        unreadNotificationCount: 1
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByText('Order confirmed')).toBeTruthy();
    expect(screen.getByText('Mark all read')).toBeTruthy();

    fireEvent.click(screen.getByText('SK-M3SGQA - Track Order'));
    expect(onMarkNotificationRead).toHaveBeenCalledWith(expect.objectContaining({ notification_id: 77 }));
    expect(onTrackReference).toHaveBeenCalledWith(expect.objectContaining({ reference: 'SK-M3SGQA' }));

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByText('Mark all read'));
    expect(onMarkAllNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it('shows Set Default only for non-default addresses while keeping edit and delete available', () => {
    const onSetDefaultAddress = vi.fn();
    renderDashboard({ onSetDefaultAddress });

    fireEvent.click(screen.getByRole('button', { name: 'Addresses' }));

    expect(screen.getAllByText('Default').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Iloilo Business Park').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Set Default' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Set Default' }));
    expect(onSetDefaultAddress).toHaveBeenCalledWith(expect.objectContaining({ address_id: 'addr-2' }));
  }, 15000);

  it('uses the authenticated account profile email in the Account tab instead of a stale contact string', () => {
    renderDashboard({
      accountIdentityContact: '+639108617987 | stale@example.com',
      accountPanel: {
        ...accountPanel,
        me: {
          ...accountPanel.me,
          email: 'real-dgfy@example.com'
        }
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Account' }));

    expect(screen.getAllByText('real-dgfy@example.com').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('stale@example.com')).toBeNull();
  });

  it('renders the drawer above the Discovery header stacking layer', () => {
    renderDashboard({ presentation: 'drawer' });

    const drawer = screen.getByTestId('dgfy-customer-account-page');
    expect(drawer.style.position).toBe('fixed');
    expect(drawer.style.zIndex).toBe('1400');
  });

  it('keeps Storefront open until the user confirms a new POS tab', () => {
    const onOpenBusinessPos = vi.fn();
    renderDashboard({
      onOpenBusinessPos,
      accountPanel: {
        ...accountPanel,
        businessStepUp: { verified: true }
      }
    });

    fireEvent.click(screen.getByRole('button', { name: /Business Premium/i }));

    expect(screen.getByText('Premium access to the companies and tools connected to this DGFY account.')).toBeTruthy();
    expect(screen.getByText('Business Owner')).toBeTruthy();
    expect(screen.getByAltText('Space Bar cover')).toBeTruthy();
    expect(screen.getByAltText('Space Bar profile')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Go to POS' }));
    expect(screen.getByRole('dialog', { name: 'Open DGFY POS?' })).toBeTruthy();
    expect(onOpenBusinessPos).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stay on Storefront' }));
    expect(screen.queryByRole('dialog', { name: 'Open DGFY POS?' })).toBeNull();
    expect(onOpenBusinessPos).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Go to POS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open POS in new tab' }));
    expect(onOpenBusinessPos).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'tenant-1' }),
      { openInNewTab: true }
    );
    expect(screen.queryByRole('button', { name: 'Go to Inventory' })).toBeNull();
  });
});
