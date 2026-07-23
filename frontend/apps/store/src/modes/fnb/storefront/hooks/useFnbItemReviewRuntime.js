import { useCallback, useEffect, useRef } from 'react';

/**
 * Owns F&B item-review fetching and invite handling. The route shell injects
 * existing navigation and state adapters so this hook does not redefine APIs.
 */
export function useFnbItemReviewRuntime({
  buildHistoryState,
  buildItemDetailTarget,
  catalog,
  customerName,
  detailItem,
  isDetailsRoute,
  isFnbMode,
  itemReviewInviteContext,
  itemSubpage,
  normalizeErrorMessage,
  onOpenDetail,
  requestJson,
  reviewDraft,
  reviewSubmitLoading,
  routeItemId,
  routeReviewToken,
  routeSlug,
  savedCustomerName,
  selectedStore,
  setInviteContext,
  setIsReviewModalOpen,
  setReviewCards,
  setReviewDraft,
  setReviewLoading,
  setReviewSectionHighlighted,
  setReviewSummary,
  setReviewSubmitLoading,
  setRouteReviewToken,
  toast,
  toSlug
}) {
  const validatedInviteTokenRef = useRef('');

  useEffect(() => {
    // A review token belongs to one storefront; do not carry validation state
    // into a different storefront after route/store changes.
    validatedInviteTokenRef.current = '';
  }, [selectedStore?.slug]);

  const scrollReviewSectionIntoView = useCallback(() => {
    if (typeof document === 'undefined') return;
    const section = document.getElementById('fnb-item-reviews-section');
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setReviewSectionHighlighted(true);
    window.setTimeout(() => setReviewSectionHighlighted(false), 1800);
  }, [setReviewSectionHighlighted]);

  const removeReviewTokenFromItemRoute = useCallback((itemId = routeItemId) => {
    const normalizedStoreSlug = toSlug(selectedStore?.slug || routeSlug);
    const resolvedItemId = String(itemId || '').trim();
    if (!normalizedStoreSlug || !resolvedItemId || typeof window === 'undefined') return;

    const target = buildItemDetailTarget(normalizedStoreSlug, resolvedItemId);
    window.history.replaceState(buildHistoryState({
      storeSlug: normalizedStoreSlug,
      storeSubpage: itemSubpage,
      itemId: resolvedItemId
    }), '', target);
    setRouteReviewToken('');
  }, [buildHistoryState, buildItemDetailTarget, itemSubpage, routeItemId, routeSlug, selectedStore?.slug, setRouteReviewToken, toSlug]);

  const loadFnbItemReviews = useCallback(async (itemId) => {
    const tenantId = String(selectedStore?.tenant_id || '').trim();
    const normalizedStoreSlug = toSlug(selectedStore?.slug || routeSlug);
    const normalizedItemId = String(itemId || '').trim();
    if (!tenantId || !normalizedItemId || !normalizedStoreSlug) {
      setReviewSummary(null);
      setReviewCards([]);
      return;
    }

    setReviewLoading(true);
    try {
      const query = new URLSearchParams({
        tenant_id: tenantId,
        target_type: 'fnb_item',
        target_id: normalizedItemId,
        limit: '12'
      });
      const data = await requestJson(`/api/v1/dgfy/customer/reviews/public?${query.toString()}`, {
        storeSlug: normalizedStoreSlug,
        cache: 'no-store'
      });
      setReviewSummary(data?.summary || null);
      setReviewCards(Array.isArray(data?.reviews) ? data.reviews : []);
    } catch {
      setReviewSummary(null);
      setReviewCards([]);
      // Public-review failures must not block product details.
    } finally {
      setReviewLoading(false);
    }
  }, [requestJson, routeSlug, selectedStore?.slug, selectedStore?.tenant_id, setReviewCards, setReviewLoading, setReviewSummary, toSlug]);

  useEffect(() => {
    if (!isFnbMode || !detailItem?.item_id) {
      setReviewSummary(null);
      setReviewCards([]);
      setReviewLoading(false);
      return;
    }
    loadFnbItemReviews(detailItem.item_id);
  }, [detailItem?.item_id, isFnbMode, loadFnbItemReviews, setReviewCards, setReviewLoading, setReviewSummary]);

  useEffect(() => {
    if (!isFnbMode || !isDetailsRoute || !detailItem?.item_id) return;
    const inviteToken = String(routeReviewToken || '').trim();
    if (!inviteToken || validatedInviteTokenRef.current === inviteToken) return;
    validatedInviteTokenRef.current = inviteToken;
    let cancelled = false;

    (async () => {
      try {
        const data = await requestJson(`/api/v1/dgfy/customer/review-invites/${encodeURIComponent(inviteToken)}`, { cache: 'no-store' });
        const invite = data?.invite || null;
        if (cancelled || !invite) return;
        if (String(invite.target_type || '').trim() !== 'fnb_item' || Number(invite.target_id) !== Number(detailItem.item_id)) {
          toast.info('This review link belongs to a different menu item.');
          removeReviewTokenFromItemRoute(detailItem.item_id);
          return;
        }
        setInviteContext({ token: inviteToken, invite });
        setReviewDraft((previous) => ({
          ...previous,
          name: String(previous.name || savedCustomerName || customerName || '').trim()
        }));
        window.setTimeout(() => {
          if (cancelled) return;
          scrollReviewSectionIntoView();
          setIsReviewModalOpen(true);
        }, 180);
      } catch (error) {
        if (!cancelled) {
          toast.info(normalizeErrorMessage(error, 'This review link is no longer available.'));
          removeReviewTokenFromItemRoute(detailItem.item_id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerName, detailItem?.item_id, isDetailsRoute, isFnbMode, normalizeErrorMessage, removeReviewTokenFromItemRoute, requestJson, routeReviewToken, savedCustomerName, scrollReviewSectionIntoView, setInviteContext, setIsReviewModalOpen, setReviewDraft, toast]);

  const openFnbItemReviewFromInvite = useCallback((invite) => {
    if (!invite?.token || !invite?.target_id) return;
    const targetItem = catalog.find((entry) => Number(entry?.item_id) === Number(invite.target_id))
      || (detailItem && Number(detailItem.item_id) === Number(invite.target_id) ? detailItem : null)
      || { item_id: invite.target_id, name: invite.item_name || 'Menu item' };
    onOpenDetail(targetItem, { reviewToken: invite.token });
  }, [catalog, detailItem, onOpenDetail]);

  const resetReviewDraft = useCallback(() => {
    setReviewDraft({
      name: '',
      anonymous: false,
      rating: 0,
      message: ''
    });
  }, [setReviewDraft]);

  const submitFnbItemReview = useCallback(async () => {
    if (reviewSubmitLoading) return;
    if (!String(reviewDraft.name || '').trim()) {
      toast.error('Enter your name before sending a review.');
      return;
    }
    if (!Number(reviewDraft.rating)) {
      toast.error('Choose a star rating before sending a review.');
      return;
    }
    if (isFnbMode && itemReviewInviteContext?.token && detailItem?.item_id) {
      setReviewSubmitLoading(true);
      try {
        await requestJson(`/api/v1/dgfy/customer/review-invites/${encodeURIComponent(itemReviewInviteContext.token)}/submit`, {
          method: 'POST',
          body: {
            name: reviewDraft.name,
            anonymous: reviewDraft.anonymous === true,
            rating: reviewDraft.rating,
            comment: String(reviewDraft.message || '').trim() || null,
            submission_channel: itemReviewInviteContext?.invite?.delivery_channel || 'tracking'
          }
        });
        toast.success('Review submitted for approval.');
        setIsReviewModalOpen(false);
        setInviteContext(null);
        removeReviewTokenFromItemRoute(detailItem.item_id);
        resetReviewDraft();
        await loadFnbItemReviews(detailItem.item_id);
        return;
      } catch (error) {
        toast.error(normalizeErrorMessage(error, 'Unable to submit your review right now.'));
        return;
      } finally {
        setReviewSubmitLoading(false);
      }
    }
    toast.info('Review submission UI is ready. Backend publishing will be connected later.');
    setIsReviewModalOpen(false);
    resetReviewDraft();
  }, [
    detailItem?.item_id,
    isFnbMode,
    itemReviewInviteContext,
    loadFnbItemReviews,
    normalizeErrorMessage,
    removeReviewTokenFromItemRoute,
    requestJson,
    resetReviewDraft,
    reviewDraft,
    reviewSubmitLoading,
    setInviteContext,
    setIsReviewModalOpen,
    setReviewSubmitLoading,
    toast
  ]);

  return {
    loadFnbItemReviews,
    openFnbItemReviewFromInvite,
    removeReviewTokenFromItemRoute,
    resetFnbItemReviewDraft: resetReviewDraft,
    submitFnbItemReview,
    syncFnbItemReviewSectionIntoView: scrollReviewSectionIntoView
  };
}
