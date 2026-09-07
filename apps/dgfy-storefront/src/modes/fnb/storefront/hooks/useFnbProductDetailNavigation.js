import { useCallback } from 'react';

import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../../../packages/web-core/src/observability/analyticsEvents.js';

/**
 * Owns shared storefront item-detail navigation for F&B, Retail, and
 * Simple/MSME routes while the app shell continues to provide the existing
 * route primitives. The fnb-prefixed module path is retained for compatibility
 * with the current route boundary; behavior must stay mode-agnostic here.
 */
export function useFnbProductDetailNavigation({
  buildCatalogTarget,
  buildHistoryState,
  buildItemDetailTarget,
  isCurrentTarget,
  itemSubpage,
  routeSlug,
  selectedLocationId,
  selectedStoreSlug,
  setFnbDetail,
  setFnbDetailQuantity,
  setFnbLineModifiers,
  setFnbOrderStep,
  setIsCheckoutOpen,
  setItemReviewInviteContext,
  setRouteItemId,
  setRouteReviewToken,
  setRouteServiceItemId,
  setRouteSlug,
  setRouteSubpage,
  setSimpleOrderStep,
  toSlug
}) {
  const openFnbDetail = useCallback((item, options = {}) => {
    const normalizedStoreSlug = toSlug(selectedStoreSlug || routeSlug);
    const itemId = String(item?.item_id || '').trim();
    if (!normalizedStoreSlug || !itemId || typeof window === 'undefined') return;

    const reviewToken = String(options.reviewToken || '').trim();
    const target = buildItemDetailTarget(normalizedStoreSlug, itemId, { reviewToken, locationId: selectedLocationId });
    if (!isCurrentTarget(target)) {
      window.history.pushState(buildHistoryState({
        storeSlug: normalizedStoreSlug,
        storeSubpage: itemSubpage,
        itemId,
        reviewToken,
        locationId: selectedLocationId
      }), '', target);
    }

    setFnbDetail(item);
    setFnbDetailQuantity(1);
    setFnbLineModifiers([]);
    setRouteSlug(normalizedStoreSlug);
    setRouteSubpage(itemSubpage);
    setRouteItemId(itemId);
    setRouteReviewToken(reviewToken);
    setIsCheckoutOpen(false);
    trackFunnelEvent(ANALYTICS_EVENTS.ITEM_VIEWED, {
      store_slug: normalizedStoreSlug,
      item_id: itemId,
      item_name: item?.name,
      price: item?.default_sale_price ?? item?.price
    });
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }, [
    buildHistoryState,
    buildItemDetailTarget,
    isCurrentTarget,
    itemSubpage,
    routeSlug,
    selectedLocationId,
    selectedStoreSlug,
    setFnbDetail,
    setFnbDetailQuantity,
    setFnbLineModifiers,
    setIsCheckoutOpen,
    setRouteItemId,
    setRouteReviewToken,
    setRouteSlug,
    setRouteSubpage,
    toSlug
  ]);

  const closeFnbDetail = useCallback(() => {
    const normalizedStoreSlug = toSlug(selectedStoreSlug || routeSlug);
    if (!normalizedStoreSlug || typeof window === 'undefined') return;

    const target = buildCatalogTarget(normalizedStoreSlug, { locationId: selectedLocationId });
    if (!isCurrentTarget(target)) {
      window.history.pushState(buildHistoryState({ storeSlug: normalizedStoreSlug, locationId: selectedLocationId }), '', target);
    }

    setFnbDetail(null);
    setFnbDetailQuantity(1);
    setFnbLineModifiers([]);
    setRouteSlug(normalizedStoreSlug);
    setRouteSubpage(null);
    setRouteServiceItemId(null);
    setRouteItemId(null);
    setRouteReviewToken('');
    setItemReviewInviteContext(null);
    setIsCheckoutOpen(false);
    setFnbOrderStep(3);
    setSimpleOrderStep(1);

    // Opening an item intentionally moves the viewport to the top of the
    // detail page. Restore the catalog section after the route state has
    // rendered so the back control returns the customer to the menu they were
    // browsing instead of leaving them at the storefront hero.
    const scrollToCatalog = () => {
      document.getElementById('storefront-catalog-section')?.scrollIntoView?.({ behavior: 'auto', block: 'start' });
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        scrollToCatalog();
      });
    } else {
      window.setTimeout(scrollToCatalog, 0);
    }
  }, [
    buildCatalogTarget,
    buildHistoryState,
    isCurrentTarget,
    routeSlug,
    selectedLocationId,
    selectedStoreSlug,
    setFnbDetail,
    setFnbDetailQuantity,
    setFnbLineModifiers,
    setFnbOrderStep,
    setIsCheckoutOpen,
    setItemReviewInviteContext,
    setRouteItemId,
    setRouteReviewToken,
    setRouteServiceItemId,
    setRouteSlug,
    setRouteSubpage,
    setSimpleOrderStep,
    toSlug
  ]);

  return { closeFnbDetail, openFnbDetail };
}
