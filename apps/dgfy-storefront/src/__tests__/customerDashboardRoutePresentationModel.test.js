import { describe, expect, it } from 'vitest';
import {
  buildCustomerDashboardRouteFlags,
  buildCustomerDashboardTabPath,
  getCustomerDashboardTabFromLocation,
  isCustomerDashboardGlobalPath,
  isCustomerDashboardStandalonePath
} from '../customer-dashboard/pages/customerDashboardRoutePresentationModel.js';

describe('customer dashboard route presentation model', () => {
  it('recognizes the global dashboard overview and tab routes', () => {
    expect(isCustomerDashboardStandalonePath('/map-dgfy/account')).toBe(true);
    expect(isCustomerDashboardGlobalPath('/map-dgfy/account/business')).toBe(true);
    expect(isCustomerDashboardGlobalPath('/tenant-store/len2-sari-sari-store/account/business')).toBe(false);
    expect(getCustomerDashboardTabFromLocation({ pathname: '/map-dgfy/account' })).toBe('overview');
    expect(getCustomerDashboardTabFromLocation({ pathname: '/map-dgfy/account/business' })).toBe('business');
    expect(getCustomerDashboardTabFromLocation({ pathname: '/map-dgfy/account/settings' })).toBe('account');
  });

  it('preserves the tenant storefront identity when building dashboard tab paths', () => {
    expect(getCustomerDashboardTabFromLocation({ pathname: '/tenant-store/len2-sari-sari-store/account/business' })).toBe('business');
    expect(buildCustomerDashboardTabPath({ pathname: '/tenant-store/len2-sari-sari-store/account', tab: 'account' }))
      .toBe('/tenant-store/len2-sari-sari-store/account/settings');
    expect(getCustomerDashboardTabFromLocation({ pathname: '/account/business' })).toBe('business');
  });

  it('supports the legacy tab query and canonicalizes dashboard paths', () => {
    expect(getCustomerDashboardTabFromLocation({ pathname: '/map-dgfy/account', search: '?tab=business' })).toBe('business');
    expect(buildCustomerDashboardTabPath({ pathname: '/map-dgfy/account', tab: 'overview' }))
      .toBe('/map-dgfy/account/overview');
  });

  it('keeps invalid dashboard tabs on the overview route', () => {
    expect(getCustomerDashboardTabFromLocation({ pathname: '/map-dgfy/account/not-a-tab' })).toBe('overview');
    expect(buildCustomerDashboardRouteFlags({ currentPathname: '/map-dgfy/account/not-a-tab' })).toMatchObject({
      isGlobalAccountPage: true,
      isStandaloneAccountPage: true,
      dashboardTab: 'overview'
    });
  });
});
