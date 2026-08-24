import React from 'react';

import { getStorefrontContactFooterLinks, getStorefrontSocialFooterLinks } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { StorefrontFooterSection } from '../../../../shared/components/storefront/sections/StorefrontFooterSection.jsx';
import { StorefrontPromoSection } from '../../../../shared/components/storefront/sections/StorefrontPromoSection.jsx';
import { StorefrontReviewsSection } from '../../../../shared/components/storefront/sections/StorefrontReviewsSection.jsx';
import { StorefrontReviewModal } from '../../../../shared/components/storefront/StorefrontReviewModal.jsx';

export function RetailStorefrontRoutePage({ checkoutPromoCode, handlePromoCardApply, isMobileViewport, isReviewModalOpen, modeAdapter, promoSectionModel, retailStorefrontModel, reviewDraft, setIsReviewModalOpen, setReviewDraft, submitReview, viewportWidth }) {
  if (!retailStorefrontModel) return null;

  return (
    <>
      <StorefrontPromoSection items={promoSectionModel} isMobileViewport={isMobileViewport} layoutVariant="feature" palette="retail" titleFontFamily={modeAdapter.heroTheme?.displayFont} bodyFontFamily={modeAdapter.heroTheme?.bodyFont} titleSize={isMobileViewport ? 28 : 36} subtitleSize={isMobileViewport ? 14 : 16} activePromoCode={checkoutPromoCode} onApplyPromo={handlePromoCardApply} />
      <StorefrontReviewsSection isMobileViewport={isMobileViewport} viewportWidth={viewportWidth} title="Customer Reviews" subtitle="See what customers say about this storefront" onWriteReview={() => setIsReviewModalOpen(true)} reviewHighlights={retailStorefrontModel.reviewHighlights} emptyMessage="Customer reviews will appear here once this storefront adds review data in SKUpervisor." titleFontFamily={modeAdapter.heroTheme?.displayFont} bodyFontFamily={modeAdapter.heroTheme?.bodyFont} titleSize={isMobileViewport ? 28 : 36} subtitleSize={isMobileViewport ? 14 : 16} starSymbol="*" />
      <StorefrontFooterSection
        isMobileViewport={isMobileViewport}
        name={retailStorefrontModel.name}
        registrationYear={retailStorefrontModel.registrationYear}
        description={retailStorefrontModel.tagline || retailStorefrontModel.aboutText || 'Storefront powered by SKUpervisor content.'}
        displayFont={modeAdapter.heroTheme?.displayFont}
        bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
        badgeLinks={getStorefrontSocialFooterLinks(retailStorefrontModel.footerLinks)}
        columns={[
          { title: 'Products', items: retailStorefrontModel.productGroups.map((group) => ({ label: group })), emptyText: 'No product categories yet.' },
          { title: 'Socials', items: getStorefrontSocialFooterLinks(retailStorefrontModel.footerLinks).map((link) => ({ label: link.label, href: link.href })), emptyText: 'No social links yet.' },
          { title: 'Contact', items: [...getStorefrontContactFooterLinks(retailStorefrontModel.footerLinks).map((link) => ({ label: link.label === 'Call' ? String(link.href).replace('tel:', '') : String(link.href).replace('mailto:', ''), href: link.href })), ...(retailStorefrontModel.hours ? [{ label: retailStorefrontModel.hours }] : []), { label: retailStorefrontModel.locationLabel }] }
        ]}
      />
      {isReviewModalOpen && <StorefrontReviewModal isMobileViewport={isMobileViewport} eyebrowColor={modeAdapter.heroTheme?.accent || '#1A4E8D'} starColor={modeAdapter.heroTheme?.accent || '#1A4E8D'} starBg="#eff6ff" starShadow="0 10px 20px rgba(26,78,141,0.16)" keyPrefix="retail-review-rating" messagePlaceholder="Tell customers what stood out about the product selection, ordering, or pickup experience." reviewDraft={reviewDraft} onReviewDraftChange={setReviewDraft} onClose={() => setIsReviewModalOpen(false)} onSubmit={submitReview} />}
    </>
  );
}
