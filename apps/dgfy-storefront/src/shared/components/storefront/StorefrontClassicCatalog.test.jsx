/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { StorefrontClassicCatalog } from './StorefrontClassicCatalog.jsx';

// RF-4 (PR #1583 review): the legacy services/default catalog renderer's service-family tab
// strip must select and key by `categoryIdentity` (the stable, folder_id-based identity), never
// `categoryKey` (the normalized display text) -- two distinct folders can share a `categoryKey`
// but never a `categoryIdentity`.
const baseProps = {
  addToCart: vi.fn(),
  catalogError: null,
  catalogItemsToRender: [],
  catalogSearch: '',
  catalogState: 'ready',
  checkoutPromoCode: '',
  filteredCatalog: [],
  getCartFlySourceRect: vi.fn(),
  handlePromoCardApply: vi.fn(),
  hasCatalogSearchQuery: false,
  isDesktopViewport: true,
  isMobileViewport: false,
  isResolvedOrderSubpage: false,
  isReviewModalOpen: false,
  isServicesMode: true,
  itemsToRender: [],
  modeAdapter: { catalogHeading: 'Services', catalogSubtitle: '' },
  openServiceDetail: vi.fn(),
  promoSectionModel: [],
  refreshStorePageForTenantSetup: vi.fn(),
  reviewDraft: {},
  selectedStore: { storefront_review_summary: {} },
  servicesPrimary: '#1A4E8D',
  servicesPrimaryDark: '#1A4586',
  setActiveServiceTab: vi.fn(),
  setCatalogSearch: vi.fn(),
  setIsReviewModalOpen: vi.fn(),
  setReviewDraft: vi.fn(),
  defaultStorefrontModel: null,
  defaultOrderRouteProps: {},
  viewportWidth: 1440,
  submitReview: vi.fn()
};

describe('StorefrontClassicCatalog — service family tabs', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders and independently selects two colliding-categoryKey, distinct-categoryIdentity service groups', () => {
    const servicesViewModel = {
      serviceGroups: [
        {
          categoryKey: 'wash',
          categoryIdentity: 'folder:10',
          categoryMeta: { label: 'Wash', accent: '#1A4E8D', accentBg: '#EEF6FD' },
          items: [{ item_id: 1 }]
        },
        {
          categoryKey: 'wash',
          categoryIdentity: 'folder:11',
          categoryMeta: { label: 'Wash', accent: '#1A4E8D', accentBg: '#EEF6FD' },
          items: [{ item_id: 2 }]
        }
      ]
    };
    const setActiveServiceTab = vi.fn();
    render(
      <StorefrontClassicCatalog
        {...baseProps}
        servicesViewModel={servicesViewModel}
        isMultiGroup
        resolvedTab=""
        activeGroupMeta={null}
        setActiveServiceTab={setActiveServiceTab}
      />
    );

    // This desktop render includes both the main service-family tab strip and (isServicesMode &&
    // !isMobileViewport) the ServicesPerformanceSidebar quick-nav -- both consume the same
    // serviceGroups, so 2 "Wash" tabs appear per component (4 total). Both distinct-folder groups
    // render as separate tabs in each -- neither silently dropped nor merged into one.
    const washTabs = screen.getAllByRole('button', { name: /Wash/ });
    expect(washTabs).toHaveLength(4);

    washTabs.forEach((tab) => fireEvent.click(tab));
    const calledIdentities = setActiveServiceTab.mock.calls.map((call) => call[0]);
    expect(new Set(calledIdentities)).toEqual(new Set(['folder:10', 'folder:11']));
    expect(calledIdentities.filter((identity) => identity === 'folder:10')).toHaveLength(2);
    expect(calledIdentities.filter((identity) => identity === 'folder:11')).toHaveLength(2);
  });
});
