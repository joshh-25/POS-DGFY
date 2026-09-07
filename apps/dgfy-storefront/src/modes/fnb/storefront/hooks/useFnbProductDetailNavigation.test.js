// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCatalogTarget,
  buildItemDetailTarget,
  buildStorefrontHistoryState,
  isCurrentStorefrontTarget
} from '../../../../app/routing/storefrontNavigation.js';
import { STORE_ITEM_SUBPAGE } from '../../../../app/routing/storefrontRouting.js';
import { toSlug } from '../../../../shared/utils/storefrontFormatters.js';
import { useFnbProductDetailNavigation } from './useFnbProductDetailNavigation.js';

const buildProps = (overrides = {}) => ({
  buildCatalogTarget,
  buildHistoryState: buildStorefrontHistoryState,
  buildItemDetailTarget,
  isCurrentTarget: isCurrentStorefrontTarget,
  itemSubpage: STORE_ITEM_SUBPAGE,
  routeSlug: 'sy-side-resto-0c100c',
  selectedLocationId: 1,
  selectedStoreSlug: 'sy-side-resto-0c100c',
  setFnbDetail: vi.fn(),
  setFnbDetailQuantity: vi.fn(),
  setFnbLineModifiers: vi.fn(),
  setFnbOrderStep: vi.fn(),
  setIsCheckoutOpen: vi.fn(),
  setItemReviewInviteContext: vi.fn(),
  setRouteItemId: vi.fn(),
  setRouteReviewToken: vi.fn(),
  setRouteServiceItemId: vi.fn(),
  setRouteSlug: vi.fn(),
  setRouteSubpage: vi.fn(),
  setSimpleOrderStep: vi.fn(),
  toSlug,
  ...overrides
});

describe('useFnbProductDetailNavigation', () => {
  let originalRequestAnimationFrame;

  beforeEach(() => {
    window.history.replaceState({}, '', '/tenant-store/sy-side-resto-0c100c/item?item=42&location_id=1');
    originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    document.body.innerHTML = '';
  });

  it('returns item viewers to the shared catalog section after closing details', () => {
    const catalogSection = document.createElement('section');
    catalogSection.id = 'storefront-catalog-section';
    catalogSection.scrollIntoView = vi.fn();
    document.body.appendChild(catalogSection);
    const props = buildProps();
    const { result } = renderHook(() => useFnbProductDetailNavigation(props));

    act(() => result.current.closeFnbDetail());

    expect(`${window.location.pathname}${window.location.search}`).toBe('/tenant-store/sy-side-resto-0c100c?location_id=1');
    expect(catalogSection.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(props.setRouteSubpage).toHaveBeenCalledWith(null);
    expect(props.setRouteItemId).toHaveBeenCalledWith(null);
  });
});
