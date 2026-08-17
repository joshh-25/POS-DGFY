// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DgfyCustomerAccountPage } from '../customer-dashboard/pages/DgfyCustomerAccountPage.jsx';
import { CUSTOMER_DASHBOARD_NAV_ITEMS } from '../customer-dashboard/model/customerDashboardPresentation.jsx';

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
    onGoDiscovery={vi.fn()}
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

    expect(screen.queryByText('Back to Discovery')).toBeNull();
    expect(screen.getAllByText('Sam Paul').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Grow your business')).toBeNull();
    expect(screen.queryByText('Past Orders')).toBeNull();
    expect(screen.queryByText('Loyalty Points')).toBeNull();
    expect(screen.getByText('Default Address')).toBeTruthy();
    expect(screen.getByText('Atria Park District, Mandurriao, Iloilo City')).toBeTruthy();
    expect(screen.getByText('Quick Actions')).toBeTruthy();
    expect(screen.getByText('Reorder Items')).toBeTruthy();
    expect(screen.getByText('Update Profile')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Profile' })).toBeTruthy();
  });

  it('hides Loyalty navigation while retaining its future navigation configuration', () => {
    renderDashboard();

    expect(screen.queryByRole('button', { name: 'Loyalty', exact: true })).toBeNull();
    expect(CUSTOMER_DASHBOARD_NAV_ITEMS.find((item) => item.id === 'loyalty')).toMatchObject({
      id: 'loyalty',
      label: 'Loyalty',
      visible: false
    });
  });

  it('uses the shared responsive typography scale for page titles and filter tabs', () => {
    renderDashboard({ isMobileViewport: false });

    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Orders', exact: true }));
    expect(screen.getByRole('heading', { name: 'Orders' }).style.fontSize).toBe('26px');
    expect(screen.getByRole('button', { name: /Active Orders2/ }).style.fontSize).toBe('14px');

    cleanup();
    renderDashboard({ isMobileViewport: true });

    fireEvent.click(screen.getByRole('button', { name: /0 Bookings/ }));
    expect(screen.getByText('Bookings', { selector: 'h2' }).style.fontSize).toBe('22px');
    expect(screen.getByRole('button', { name: 'Active Bookings 0' }).style.fontSize).toBe('13px');
  }, 15000);

  it('shows the profile edit icon action in the mobile identity card', () => {
    renderDashboard({ isMobileViewport: true });

    expect(screen.getByRole('button', { name: 'Edit Profile' })).toBeTruthy();
    expect(screen.getByTitle('Edit Profile')).toBeTruthy();
  });

  it('redirects from the Overview CTA through the discovery navigation callback', () => {
    const onGoDiscovery = vi.fn();
    renderDashboard({ onGoDiscovery });

    expect(screen.getByText("Curious what's around you?")).toBeTruthy();
    expect(screen.getByText('Explore nearby businesses, products, and services at DGFY Map')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discover something' }));

    expect(onGoDiscovery).toHaveBeenCalledTimes(1);
  });

  it('stacks the Overview profile and discovery cards on mobile', () => {
    renderDashboard({ isMobileViewport: true });

    expect(screen.getByTestId('overview-discovery-layout').style.gridTemplateColumns).toBe('1fr');
  });

  it('shows an incomplete profile setup score without the full verified banner', () => {
    renderDashboard();

    expect(screen.queryByTestId('customer-profile-verification-score')).toBeNull();
    expect(screen.getByText('Profile Score: 2/3')).toBeTruthy();
    expect(screen.queryByText('Verified', { exact: true })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Account' }));

    expect(screen.getByTestId('customer-profile-verification-score')).toBeTruthy();
    expect(screen.getByText('Profile Score: 2/3')).toBeTruthy();
  });

  it('keeps the Overview mobile profile score beside the name and shows only the score', () => {
    renderDashboard({ isMobileViewport: true });

    const status = screen.getByTestId('customer-profile-verification-status');
    expect(status.textContent).toContain('2/3');
    expect(status.textContent).not.toContain('Profile Score:');
    expect(status.getAttribute('aria-label')).toBe('Profile Score: 2/3');
    expect(status.parentElement.style.flexWrap).toBe('nowrap');
  });

  it('shows the full verified banner beside the customer name only at 3/3', () => {
    renderDashboard({
      accountPanel: {
        ...accountPanel,
        me: {
          ...accountPanel.me,
          is_identity_verified: true
        }
      }
    });

    expect(screen.queryByText('3/3')).toBeNull();
    expect(screen.getByText('Verified', { exact: true })).toBeTruthy();
  });

  it('uses the compact full verified status beside the Account customer name at 3/3', () => {
    renderDashboard({
      accountPanel: {
        ...accountPanel,
        me: {
          ...accountPanel.me,
          is_identity_verified: true
        }
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Account' }));

    expect(screen.getByTestId('customer-profile-verification-score')).toBeTruthy();
    expect(screen.getByText('3/3')).toBeTruthy();
    const status = within(screen.getByTestId('customer-profile-verification-status'));
    expect(status.getByText('Verified', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Profile Score: 3/3')).toBeNull();
  });

  it('removes the retired overview KPI cards on mobile and navigates remaining KPIs to their pages', () => {
    const mobileKpiDestinations = [
      ['Active Orders', 'Orders'],
      ['Bookings', 'Bookings'],
      ['Addresses', 'Saved Locations']
    ];

    for (const [label, heading] of mobileKpiDestinations) {
      renderDashboard({ isMobileViewport: true });

      expect(screen.queryByText('Past Orders')).toBeNull();
      expect(screen.queryByText('Loyalty Points')).toBeNull();

      const overviewKpis = within(screen.getByTestId('customer-dashboard-overview-kpis'));
      const kpi = overviewKpis.getByRole('button', { name: new RegExp(label) });
      if (label === 'Addresses') expect(kpi.style.gridColumn).toBe('1 / -1');
      fireEvent.click(kpi);
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();

      cleanup();
    }
  });

  it('filters bookings by active, past, and booking review tabs', () => {
    renderDashboard({
      accountPanel: {
        ...accountPanel,
        bookings: [
          { reference: 'BK-ACTIVE', store_name: 'Active Service', status: 'confirmed', occurred_at: '2026-08-10T09:00:00Z' },
          { reference: 'BK-PAST', store_name: 'Past Service', status: 'completed', occurred_at: '2026-07-10T09:00:00Z' }
        ],
        reviews: [
          { review_id: 'booking-review-1', activity_type: 'service_booking', store_name: 'Reviewed Service', status: 'published', comment: 'Great service.' }
        ]
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bookings', exact: true }));
    expect(screen.getByRole('button', { name: /Active Bookings 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Past Bookings 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reviews 1/ })).toBeTruthy();
    expect(screen.getByText('Active Service')).toBeTruthy();
    expect(screen.queryByText('Past Service')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Past Bookings 1/ }));
    expect(screen.getByText('Past Service')).toBeTruthy();
    expect(screen.queryByText('Active Service')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Reviews 1/ }));
    expect(screen.getByText('Reviewed Service')).toBeTruthy();
    expect(screen.getByText('Great service.')).toBeTruthy();
    expect(screen.queryByText('Past Service')).toBeNull();
  });

  it('shows the business growth CTA only in Business when the account has no business', () => {
    const onRegisterBusiness = vi.fn();
    renderDashboard({
      onRegisterBusiness,
      accountPanel: {
        ...accountPanel,
        businessCompanies: [],
        memberships: []
      }
    });

    expect(screen.queryByText('Grow your business')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Business' }));

    expect(screen.getByText('Grow your business')).toBeTruthy();
    expect(screen.getByText('Complete your store profile to attract more customers.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Register Your Business' }));
    expect(onRegisterBusiness).toHaveBeenCalledTimes(1);
  });

  it('does not show the growth CTA in Business when the account already has a business', () => {
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'Business' }));

    expect(screen.queryByText('Grow your business')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Business' })).toBeTruthy();
  });

  it('shows only the business industry tabs represented by the account and filters cards', () => {
    renderDashboard({
      accountPanel: {
        ...accountPanel,
        businessCompanies: [
          accountPanel.businessCompanies[0],
          {
            membership_id: 'membership-retail',
            tenant_id: 'tenant-retail',
            company_name: 'Retail Shop',
            membership_status: 'accepted',
            tenant_status: 'active',
            category_label: 'Retail'
          },
          {
            membership_id: 'membership-micro-retail',
            tenant_id: 'tenant-micro-retail',
            company_name: 'Micro Retail Stand',
            membership_status: 'accepted',
            tenant_status: 'active',
            category_label: 'Micro-Retail'
          }
        ]
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Business' }));

    expect(screen.getByRole('button', { name: 'All 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Food & Beverage 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retail 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Micro Retail 1' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retail 1' }));

    expect(screen.getByText('Retail Shop')).toBeTruthy();
    expect(screen.queryByText('Space Bar')).toBeNull();
    expect(screen.queryByText('Micro Retail Stand')).toBeNull();
  });

  it('keeps business industry tabs in one horizontally scrollable row on mobile', () => {
    renderDashboard({
      isMobileViewport: true,
      accountPanel: {
        ...accountPanel,
        businessCompanies: [
          accountPanel.businessCompanies[0],
          {
            membership_id: 'membership-retail-mobile',
            tenant_id: 'tenant-retail-mobile',
            company_name: 'Retail Mobile Shop',
            membership_status: 'accepted',
            tenant_status: 'active',
            category_label: 'Retail'
          }
        ]
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Business' }));

    const tabs = screen.getByTestId('customer-business-industry-tabs');
    expect(tabs.style.flexWrap).toBe('nowrap');
    expect(tabs.style.overflowX).toBe('auto');
    expect(screen.getByRole('button', { name: 'All 2' }).style.minHeight).toBe('44px');
    expect(screen.queryByRole('button', { name: 'Micro Retail 0' })).toBeNull();
  });

  it('uses the desktop-style underline tabs across mobile dashboard pages', () => {
    renderDashboard({ isMobileViewport: true });

    const overviewTabs = screen.getByTestId('customer-overview-activity-tabs');
    const overviewTab = within(overviewTabs).getByRole('button', { name: 'Orders' });
    expect(overviewTab.style.borderBottom).toContain('2px solid');
    expect(overviewTab.style.background).toBe('transparent');
    expect(overviewTab.style.borderRadius).toBe('0px');

    fireEvent.click(screen.getByRole('button', { name: /0 Bookings/ }));
    const bookingsTabs = screen.getByTestId('customer-bookings-tabs');
    const activeBookingsTab = within(bookingsTabs).getByRole('button', { name: 'Active Bookings 0' });
    expect(activeBookingsTab.style.borderBottom).toContain('2px solid');
    expect(activeBookingsTab.style.background).toBe('transparent');
    expect(activeBookingsTab.style.borderRadius).toBe('0px');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Business' }));
    const businessTabs = screen.getByTestId('customer-business-industry-tabs');
    const allBusinessesTab = within(businessTabs).getByRole('button', { name: 'All 1' });
    expect(allBusinessesTab.style.borderBottom).toContain('2px solid');
    expect(allBusinessesTab.style.background).toBe('transparent');
    expect(allBusinessesTab.style.borderRadius).toBe('0px');
    expect(within(screen.getByTestId('customer-business-card-mobile')).getByText('Owner')).toBeTruthy();
    expect(screen.queryByText('Business Owner')).toBeNull();
    const ownerBadge = within(screen.getByTestId('customer-business-card-mobile')).getByText('Owner');
    expect(ownerBadge.style.fontSize).toBe('12px');
    expect(ownerBadge.parentElement.style.flexWrap).toBe('wrap');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Orders', exact: true }));
    const ordersTabs = screen.getByTestId('customer-orders-tabs');
    const activeOrdersTab = within(ordersTabs).getByRole('button', { name: /Active Orders2/ });
    expect(activeOrdersTab.style.borderBottom).toContain('2px solid');
    expect(activeOrdersTab.style.background).toBe('transparent');
    expect(activeOrdersTab.style.borderRadius).toBe('0px');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Affiliate', exact: true }));
    const affiliateTabs = screen.getByTestId('customer-affiliate-tabs');
    const businessesTab = within(affiliateTabs).getByRole('button', { name: /Businesses0/ });
    expect(businessesTab.style.borderBottom).toContain('2px solid');
    expect(businessesTab.style.background).toBe('transparent');
    expect(businessesTab.style.borderRadius).toBe('0px');
  });

  it('renders four business cards per row on desktop', () => {
    const businesses = Array.from({ length: 5 }, (_, index) => ({
      ...accountPanel.businessCompanies[0],
      membership_id: `membership-desktop-${index}`,
      tenant_id: `tenant-desktop-${index}`,
      company_name: `Desktop Business ${index + 1}`
    }));
    renderDashboard({
      accountPanel: {
        ...accountPanel,
        businessCompanies: businesses
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Business' }));

    const grid = screen.getByTestId('customer-business-card-grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
    expect(screen.getAllByTestId('customer-business-card-desktop')).toHaveLength(5);
  });

  it('renders compact mobile business rows with profile logos and active state dots', () => {
    renderDashboard({
      isMobileViewport: true,
      accountPanel: {
        ...accountPanel,
        businessCompanies: [
          accountPanel.businessCompanies[0],
          {
            ...accountPanel.businessCompanies[0],
            membership_id: 'membership-inactive',
            tenant_id: 'tenant-inactive',
            company_name: 'Inactive Business',
            tenant_status: 'inactive',
            storefront_profile_image_url: '/uploads/storefront-assets/inactive/profile.png'
          }
        ]
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Business' }));

    const grid = screen.getByTestId('customer-business-card-grid');
    expect(grid.style.gridTemplateColumns).toBe('1fr');
    expect(screen.getAllByTestId('customer-business-card-mobile')).toHaveLength(2);
    expect(screen.getByAltText('Space Bar profile')).toBeTruthy();
    expect(screen.getByTestId('customer-business-status-dot-membership-1').getAttribute('aria-label')).toBe('Space Bar active');
    expect(screen.getByTestId('customer-business-status-dot-membership-inactive').getAttribute('aria-label')).toBe('Inactive Business inactive');
    expect(screen.queryByText('Accepted - Active')).toBeNull();
    expect(screen.getByTestId('customer-business-add-action').style.justifyContent).toBe('flex-end');
    expect(screen.getByRole('button', { name: 'Day Close for Space Bar' })).toBeTruthy();
    const mobilePosButton = screen.getByRole('button', { name: 'Go to POS for Space Bar' });
    expect(mobilePosButton).toBeTruthy();
    expect(mobilePosButton.style.minHeight).toBe('40px');
    expect(mobilePosButton.style.background).toBe('rgb(26, 78, 141)');
    expect(mobilePosButton.style.color).toBe('rgb(255, 255, 255)');
    const mobileBusinessName = within(screen.getAllByTestId('customer-business-card-mobile')[0]).getByRole('heading', { name: 'Space Bar' });
    expect(mobileBusinessName.style.whiteSpace).toBe('normal');
    expect(mobileBusinessName.style.display).toBe('-webkit-box');
    expect(mobileBusinessName.style.overflow).toBe('hidden');
  });

  it('keeps normal mobile business names readable and clamps only longer names', () => {
    const longBusinessName = 'A Business Name That Is Longer Than The Mobile Card Can Show';
    renderDashboard({
      isMobileViewport: true,
      accountPanel: {
        ...accountPanel,
        businessCompanies: [
          { ...accountPanel.businessCompanies[0], company_name: 'Sy Side Store' },
          { ...accountPanel.businessCompanies[0], membership_id: 'membership-long-name', tenant_id: 'tenant-long-name', company_name: longBusinessName }
        ]
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Business' }));

    const mobileCards = screen.getAllByTestId('customer-business-card-mobile');
    expect(within(mobileCards[0]).getByRole('heading', { name: 'Sy Side Store' })).toBeTruthy();
    const longNameHeading = within(mobileCards[1]).getByRole('heading', { name: longBusinessName });
    expect(longNameHeading.style.display).toBe('-webkit-box');
    expect(longNameHeading.style.whiteSpace).toBe('normal');
    expect(longNameHeading.style.overflow).toBe('hidden');
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

    fireEvent.click(screen.getByRole('button', { name: 'Business' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Business' }));

    expect(screen.getByText('Business Owner')).toBeTruthy();
    expect(screen.getByText('Cashier')).toBeTruthy();
  });

  it('sets a Day Close PIN directly in the selected business dialog without opening POS', async () => {
    const onConfigureBusinessDayClosePin = vi.fn().mockResolvedValue(undefined);
    const onGetBusinessDayCloseStatus = vi.fn().mockResolvedValue({ canCloseDay: true, pinConfigured: false });
    renderDashboard({ onConfigureBusinessDayClosePin, onGetBusinessDayCloseStatus });

    fireEvent.click(screen.getByRole('button', { name: 'Business' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Business' }));
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

  it('renders the business grid with direct POS access and storefront assets', () => {
    const onOpenBusinessPos = vi.fn();
    renderDashboard({
      onOpenBusinessPos,
      accountPanel: {
        ...accountPanel,
        businessStepUp: { verified: true }
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Business' }));

    expect(screen.getByText('Manage the businesses and tools connected to this DGFY account.')).toBeTruthy();
    expect(screen.queryByText('Premium')).toBeNull();
    expect(screen.getByText('Business Owner')).toBeTruthy();
    expect(screen.getByAltText('Space Bar cover')).toBeTruthy();
    expect(screen.getByAltText('Space Bar profile')).toBeTruthy();
    const desktopBusinessCard = screen.getByTestId('customer-business-card-desktop');
    expect(within(desktopBusinessCard).getByRole('button', { name: 'Day Close' }).parentElement.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');

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

  it('keeps Storefront open until the user confirms a new POS tab', () => {
    const onOpenBusinessPos = vi.fn();
    renderDashboard({
      onOpenBusinessPos,
      accountPanel: {
        ...accountPanel,
        businessStepUp: { verified: true }
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Business' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to POS' }));
    expect(screen.getByRole('dialog', { name: 'Open DGFY POS?' })).toBeTruthy();
    expect(onOpenBusinessPos).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stay on Storefront' }));
    expect(screen.queryByRole('dialog', { name: 'Open DGFY POS?' })).toBeNull();
  });
});
