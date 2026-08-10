import { useCallback, useMemo } from 'react';

/**
 * Builds F&B product-detail review props so the app shell does not own
 * review-route presentation decisions.
 */
export function useFnbProductDetailsReviewProps({
  customerName,
  isFnbMode,
  itemReviewCards,
  itemReviewInviteContext,
  itemReviewSectionHighlighted,
  itemReviewSummary,
  itemReviewsLoading,
  savedCustomerName,
  setIsReviewModalOpen,
  setReviewDraft,
  syncFnbItemReviewSectionIntoView
}) {
  const onOpenWriteReview = useCallback(() => {
    if (!isFnbMode) return;
    if (!itemReviewInviteContext?.token) return;

    setReviewDraft((previous) => ({
      ...previous,
      name: String(previous.name || savedCustomerName || customerName || '').trim()
    }));
    syncFnbItemReviewSectionIntoView();
    setIsReviewModalOpen(true);
  }, [
    customerName,
    isFnbMode,
    itemReviewInviteContext?.token,
    savedCustomerName,
    setIsReviewModalOpen,
    setReviewDraft,
    syncFnbItemReviewSectionIntoView
  ]);

  return useMemo(() => {
    const reviewSummary = itemReviewSummary || null;

    return {
      canWriteReview: isFnbMode && Boolean(itemReviewInviteContext?.token),
      onOpenWriteReview,
      ratingScore: isFnbMode ? (reviewSummary?.average_rating ?? reviewSummary?.score ?? null) : null,
      reviewCount: isFnbMode ? (reviewSummary?.total_count ?? reviewSummary?.totalCount ?? null) : null,
      reviewDistribution: isFnbMode ? (reviewSummary?.distribution || null) : null,
      reviews: isFnbMode ? itemReviewCards : [],
      reviewsLoading: isFnbMode ? itemReviewsLoading : false,
      reviewSectionHighlighted: itemReviewSectionHighlighted
    };
  }, [
    isFnbMode,
    itemReviewCards,
    itemReviewInviteContext?.token,
    itemReviewSectionHighlighted,
    itemReviewSummary,
    itemReviewsLoading,
    onOpenWriteReview
  ]);
}
