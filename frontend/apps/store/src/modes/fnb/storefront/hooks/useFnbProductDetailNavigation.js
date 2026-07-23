import { useCallback } from 'react';

/**
 * Owns F&B item-detail navigation while the app shell continues to provide the
 * existing route primitives. This preserves the current browser-history
 * contract without teaching the root shell F&B detail behavior.
 */
export function useFnbProductDetailNavigation({
  buildCatalogTarget,
  buildHistoryState,
  buildItemDetailTarget,
  isCurrentTarget,
  itemSubpage,
  routeSlug,
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
    const target = buildItemDetailTarget(normalizedStoreSlug, itemId, { reviewToken });
    if (!isCurrentTarget(target)) {
      window.history.pushState(buildHistoryState({
        storeSlug: normalizedStoreSlug,
        storeSubpage: itemSubpage,
        itemId,
        reviewToken
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
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }, [
    buildHistoryState,
    buildItemDetailTarget,
    isCurrentTarget,
    itemSubpage,
    routeSlug,
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

    const target = buildCatalogTarget(normalizedStoreSlug);
    if (!isCurrentTarget(target)) {
      window.history.pushState(buildHistoryState({ storeSlug: normalizedStoreSlug }), '', target);
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
  }, [
    buildCatalogTarget,
    buildHistoryState,
    isCurrentTarget,
    routeSlug,
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
