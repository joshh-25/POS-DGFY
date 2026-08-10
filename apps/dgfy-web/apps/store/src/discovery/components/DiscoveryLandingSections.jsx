import React from 'react';

import { DiscoveryBusinessOwnerCtaSection } from './DiscoveryBusinessOwnerCtaSection.jsx';
import { DiscoveryFaqSection } from './DiscoveryFaqSection.jsx';
import { DiscoveryFeaturedMerchantsSection } from './DiscoveryFeaturedMerchantsSection.jsx';
import { DiscoveryFooter } from './DiscoveryFooter.jsx';
import { DiscoveryHowItWorksSection } from './DiscoveryHowItWorksSection.jsx';

export function DiscoveryLandingSections({
  buildBusinessLoginUrl,
  buildBusinessRegistrationUrl,
  dgfyBusinessOwnerPhoto,
  dgfyHeaderLogo,
  dgfySymbolLogo,
  discoveryPinsBySlug,
  featuredCarouselRef,
  featuredCategoryFilter,
  featuredCategoryOptions,
  featuredCategoryRailRef,
  featuredSectionRef,
  featuredVisibleStores,
  formatStorefrontHoursLabel,
  getPreferredDiscoveryLocationId,
  goStore,
  handleFeaturedCategoryFilter,
  isBrandingImageBlocked,
  isMobileViewport,
  markBrandingImageError,
  normalizeStorefrontCategories,
  normalizeStorefrontReviewSummary,
  openBusinessRegistrationFlow,
  openDiscoveryFaqIndex,
  setOpenDiscoveryFaqIndex,
  toSlug,
  withAssetOrigin
}) {
  return (
    <>
      <DiscoveryHowItWorksSection isMobileViewport={isMobileViewport} />

      <DiscoveryFeaturedMerchantsSection
        discoveryPinsBySlug={discoveryPinsBySlug}
        featuredCarouselRef={featuredCarouselRef}
        featuredCategoryFilter={featuredCategoryFilter}
        featuredCategoryOptions={featuredCategoryOptions}
        featuredCategoryRailRef={featuredCategoryRailRef}
        featuredSectionRef={featuredSectionRef}
        featuredVisibleStores={featuredVisibleStores}
        formatStorefrontHoursLabel={formatStorefrontHoursLabel}
        getPreferredDiscoveryLocationId={getPreferredDiscoveryLocationId}
        goStore={goStore}
        isBrandingImageBlocked={isBrandingImageBlocked}
        isMobileViewport={isMobileViewport}
        markBrandingImageError={markBrandingImageError}
        normalizeStorefrontCategories={normalizeStorefrontCategories}
        normalizeStorefrontReviewSummary={normalizeStorefrontReviewSummary}
        onFeaturedCategoryFilter={handleFeaturedCategoryFilter}
        toSlug={toSlug}
        withAssetOrigin={withAssetOrigin}
      />

      <DiscoveryBusinessOwnerCtaSection
        dgfyBusinessOwnerPhoto={dgfyBusinessOwnerPhoto}
        dgfySymbolLogo={dgfySymbolLogo}
        isMobileViewport={isMobileViewport}
        openBusinessRegistrationFlow={openBusinessRegistrationFlow}
      />

      <DiscoveryFaqSection
        isMobileViewport={isMobileViewport}
        openDiscoveryFaqIndex={openDiscoveryFaqIndex}
        setOpenDiscoveryFaqIndex={setOpenDiscoveryFaqIndex}
      />

      <DiscoveryFooter
        buildBusinessLoginUrl={buildBusinessLoginUrl}
        buildBusinessRegistrationUrl={buildBusinessRegistrationUrl}
        dgfyHeaderLogo={dgfyHeaderLogo}
        isMobileViewport={isMobileViewport}
      />
    </>
  );
}
