import React from 'react';

import { getStorefrontContactFooterLinks, getStorefrontSocialFooterLinks } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { StorefrontFooterSection } from '../../../../shared/components/storefront/sections/StorefrontFooterSection.jsx';
import { StorefrontPromoSection } from '../../../../shared/components/storefront/sections/StorefrontPromoSection.jsx';
import { StorefrontReviewsSection } from '../../../../shared/components/storefront/sections/StorefrontReviewsSection.jsx';
import { StorefrontReviewModal } from '../../../../shared/components/storefront/StorefrontReviewModal.jsx';

/**
 * Simple/MSME storefront sections for the catalog route.
 *
 * The sections remain reusable shared presentation, while this mode-owned page
 * owns the Simple-specific copy, model fields, and footer mapping. This keeps
 * Simple composition out of the shared catalog renderer without changing the
 * shared section components themselves.
 */
export function SimpleStorefrontRoutePage({
  checkoutPromoCode,
  handlePromoCardApply,
  isMobileViewport,
  isReviewModalOpen,
  modeAdapter,
  promoSectionModel,
  reviewDraft,
  setIsReviewModalOpen,
  setReviewDraft,
  simpleStorefrontModel,
  submitReview,
  viewportWidth
}) {
  if (!simpleStorefrontModel) return null;

  return (
    <>
      <StorefrontPromoSection
        items={promoSectionModel}
        isMobileViewport={isMobileViewport}
        layoutVariant="feature"
        palette="simple"
        titleFontFamily={modeAdapter.heroTheme?.displayFont}
        bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
        titleSize={isMobileViewport ? 28 : 36}
        subtitleSize={isMobileViewport ? 14 : 16}
        activePromoCode={checkoutPromoCode}
        onApplyPromo={handlePromoCardApply}
      />

      <StorefrontReviewsSection
        isMobileViewport={isMobileViewport}
        viewportWidth={viewportWidth}
        onWriteReview={() => setIsReviewModalOpen(true)}
        writeButtonColor={modeAdapter.heroTheme?.catalogPalette?.primary || modeAdapter.heroTheme?.accent}
        reviewHighlights={simpleStorefrontModel.reviewHighlights}
        titleFontFamily={modeAdapter.heroTheme?.displayFont}
        bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
        titleSize={isMobileViewport ? 28 : 36}
        subtitleSize={isMobileViewport ? 14 : 16}
        starSymbol="*"
      />

      <StorefrontFooterSection
        isMobileViewport={isMobileViewport}
        name={simpleStorefrontModel.name}
        registrationYear={simpleStorefrontModel.registrationYear}
        description={simpleStorefrontModel.tagline || simpleStorefrontModel.aboutText || 'Simple storefront powered by SKUpervisor content.'}
        displayFont={modeAdapter.heroTheme?.displayFont}
        bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
        badgeLinks={getStorefrontSocialFooterLinks(simpleStorefrontModel.footerLinks)}
        columns={[
          {
            title: 'Products',
            items: simpleStorefrontModel.productGroups.map((group) => ({ label: group })),
            emptyText: 'No product categories yet.'
          },
          {
            title: 'Socials',
            items: getStorefrontSocialFooterLinks(simpleStorefrontModel.footerLinks).map((link) => ({ label: link.label, href: link.href })),
            emptyText: 'No social links yet.'
          },
          {
            title: 'Contact',
            items: [
              ...getStorefrontContactFooterLinks(simpleStorefrontModel.footerLinks).map((link) => ({
                label: link.label === 'Call' ? String(link.href).replace('tel:', '') : String(link.href).replace('mailto:', ''),
                href: link.href
              })),
              ...(simpleStorefrontModel.hours ? [{ label: simpleStorefrontModel.hours }] : []),
              { label: simpleStorefrontModel.locationLabel }
            ]
          }
        ]}
      />
      {isReviewModalOpen && (
        <StorefrontReviewModal
          isMobileViewport={isMobileViewport}
          eyebrowColor={modeAdapter.heroTheme?.accent || '#176B3A'}
          starColor="#176B3A"
          starBg="#f0fdf4"
          starShadow="0 10px 20px rgba(23,107,58,0.16)"
          keyPrefix="simple-review-rating"
          messagePlaceholder="Tell customers what stood out about the product selection, ordering, or pickup experience."
          reviewDraft={reviewDraft}
          onReviewDraftChange={setReviewDraft}
          onClose={() => setIsReviewModalOpen(false)}
          onSubmit={submitReview}
        />
      )}
    </>
  );
}
