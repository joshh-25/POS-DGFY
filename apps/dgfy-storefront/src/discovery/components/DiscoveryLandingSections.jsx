import React from 'react';

import { DiscoveryFaqSection } from './DiscoveryFaqSection.jsx';
import { DiscoveryFeaturedMerchantsSection } from './DiscoveryFeaturedMerchantsSection.jsx';
import { DiscoveryFooter } from './DiscoveryFooter.jsx';
import { DiscoveryHowItWorksSection } from './DiscoveryHowItWorksSection.jsx';

export function DiscoveryLandingSections({
  dgfyHeaderLogo,
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

      <DiscoveryFaqSection
        isMobileViewport={isMobileViewport}
        openDiscoveryFaqIndex={openDiscoveryFaqIndex}
        setOpenDiscoveryFaqIndex={setOpenDiscoveryFaqIndex}
      />

      <DiscoveryFooter
        dgfyHeaderLogo={dgfyHeaderLogo}
        isMobileViewport={isMobileViewport}
      />
    </>
  );
}
