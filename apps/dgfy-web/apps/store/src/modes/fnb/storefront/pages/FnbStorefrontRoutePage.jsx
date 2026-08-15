import React from 'react';

import { FnbCommunitySection } from '../components/FnbCommunitySection.jsx';
import { FnbItemReviewModal } from '../components/FnbItemReviewModal.jsx';

export function FnbStorefrontRoutePage({ checkoutPromoCode, fnbCommunityModel, handlePromoCardApply, isMobileViewport, isReviewModalOpen, modeAdapter, onReviewDraftChange, onReviewModalClose, onReviewSubmit, promoSectionModel, renderCommunity, reviewDraft, reviewSubmitLoading, setIsReviewModalOpen, viewportWidth }) {
  return (
    <>
      {renderCommunity && <FnbCommunitySection fnbCommunityModel={fnbCommunityModel} promoSectionModel={promoSectionModel} isMobileViewport={isMobileViewport} viewportWidth={viewportWidth} modeAdapter={modeAdapter} checkoutPromoCode={checkoutPromoCode} onApplyPromo={handlePromoCardApply} onWriteReview={() => setIsReviewModalOpen(true)} />}
      {isReviewModalOpen && <FnbItemReviewModal isMobileViewport={isMobileViewport} isSubmitting={reviewSubmitLoading} onClose={onReviewModalClose} onDraftChange={onReviewDraftChange} onSubmit={onReviewSubmit} reviewDraft={reviewDraft} />}
    </>
  );
}
