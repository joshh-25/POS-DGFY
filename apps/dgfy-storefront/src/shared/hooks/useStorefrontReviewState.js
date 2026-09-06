import { useStorefrontStore } from '../../store/useStorefrontStore.js';

const useReviewField = (field, suffix) => [
  useStorefrontStore((state) => state.review[field]),
  useStorefrontStore((state) => state[`reviewSet${suffix}`])
];

export function useStorefrontReviewState() {
  const [isReviewModalOpen, setIsReviewModalOpen] = useReviewField('isModalOpen', 'IsModalOpen');
  const [reviewSubmitLoading, setReviewSubmitLoading] = useReviewField('submitLoading', 'SubmitLoading');
  const [reviewDraft, setReviewDraft] = useReviewField('draft', 'Draft');
  const [itemReviewSummary, setItemReviewSummary] = useReviewField('itemSummary', 'ItemSummary');
  const [itemReviewCards, setItemReviewCards] = useReviewField('itemCards', 'ItemCards');
  const [itemReviewsLoading, setItemReviewsLoading] = useReviewField('itemsLoading', 'ItemsLoading');
  const [itemReviewInviteContext, setItemReviewInviteContext] = useReviewField('inviteContext', 'InviteContext');
  const [itemReviewSectionHighlighted, setItemReviewSectionHighlighted] = useReviewField('sectionHighlighted', 'SectionHighlighted');

  return {
    isReviewModalOpen,
    setIsReviewModalOpen,
    reviewSubmitLoading,
    setReviewSubmitLoading,
    reviewDraft,
    setReviewDraft,
    itemReviewSummary,
    setItemReviewSummary,
    itemReviewCards,
    setItemReviewCards,
    itemReviewsLoading,
    setItemReviewsLoading,
    itemReviewInviteContext,
    setItemReviewInviteContext,
    itemReviewSectionHighlighted,
    setItemReviewSectionHighlighted
  };
}

