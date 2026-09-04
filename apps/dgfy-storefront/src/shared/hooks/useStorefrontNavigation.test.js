// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStorefrontNavigation } from './useStorefrontNavigation.js';

const buildNavigationProps = () => ({
  routeSlug: 'laundry-store',
  selectedStore: { slug: 'laundry-store' },
  setRouteSlug: vi.fn(),
  setRouteSubpage: vi.fn(),
  setRouteServiceItemId: vi.fn(),
  setRouteItemId: vi.fn(),
  setRouteReviewToken: vi.fn(),
  setSelectedServiceDetail: vi.fn(),
  setPreferredStoreLocationSelection: vi.fn(),
  setIsCheckoutOpen: vi.fn(),
  setCheckoutTab: vi.fn(),
  setShowFnbMobileOrderSummary: vi.fn(),
  setFnbOrderStep: vi.fn(),
  setSimpleOrderStep: vi.fn(),
  setSelectedStore: vi.fn(),
  setStoreLocations: vi.fn(),
  setPrimaryLocationId: vi.fn(),
  setSelectedLocationId: vi.fn(),
  setHasSelectedBranchFromMenu: vi.fn(),
  setCatalog: vi.fn(),
  setCatalogError: vi.fn(),
  setDiscoveryAppliedFilters: vi.fn(),
  setActiveDiscoveryNavItem: vi.fn()
});

describe('useStorefrontNavigation', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/tenant-store/laundry-store');
  });

  it('closes the previous cart surface when switching storefronts', () => {
    const props = buildNavigationProps();
    const { result } = renderHook(() => useStorefrontNavigation(props));

    act(() => result.current.goStore('fnb-store'));

    expect(props.setIsCheckoutOpen).toHaveBeenCalledWith(false);
    expect(props.setCheckoutTab).toHaveBeenCalledWith('checkout');
    expect(props.setShowFnbMobileOrderSummary).toHaveBeenCalledWith(false);
    expect(props.setRouteSlug).toHaveBeenCalledWith('fnb-store');
  });

  it('restores the branch from a browser-history URL change', () => {
    const props = buildNavigationProps();
    renderHook(() => useStorefrontNavigation(props));

    window.history.pushState({}, '', '/tenant-store/laundry-store?location_id=2');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));

    expect(props.setSelectedLocationId).toHaveBeenCalledWith(2);
    expect(props.setHasSelectedBranchFromMenu).toHaveBeenCalledWith(true);
    expect(props.setRouteSlug).toHaveBeenCalledWith('laundry-store');
    expect(props.setPreferredStoreLocationSelection).not.toHaveBeenCalled();
  });
});
