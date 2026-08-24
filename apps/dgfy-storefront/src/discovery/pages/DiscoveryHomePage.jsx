import React from 'react';

import { DiscoveryHeader } from '../../Components/store/DiscoveryResponsiveLayout.jsx';
import { SolutionsPage } from './SolutionsPage.jsx';
import { DiscoveryExploreStage } from '../components/DiscoveryExploreStage.jsx';
import { DiscoveryLandingSections } from '../components/DiscoveryLandingSections.jsx';

export function DiscoveryHomePage({
  accountIdentityContact,
  accountIdentityInitials,
  accountIdentityName,
  accountIdentityRawEmail,
  activeDiscoveryNavItem,
  desktopCategoryRailRef,
  dgfyBusinessOwnerPhoto,
  dgfyHeaderLogo,
  dgfySymbolLogo,
  discoveryCoords,
  discoveryInteractiveAreaRef,
  discoveryLayout,
  discoveryPinsBySlug,
  discoveryResultsRendererProps,
  discoveryViewportMode,
  featuredCarouselRef,
  featuredCategoryFilter,
  featuredCategoryOptions,
  featuredCategoryRailRef,
  featuredSectionRef,
  featuredVisibleStores,
  formatStorefrontHoursLabel,
  getDiscoveryMarkerKey,
  getPreferredDiscoveryLocationId,
  goDiscovery,
  goStore,
  handleDiscoveryExploreClick,
  handleDiscoveryMenuToggle,
  handleDiscoveryNavItemClick,
  handleDiscoverySearch,
  handleFeaturedCategoryFilter,
  handleNearMe,
  handlePopularDiscoveryCategory,
  hasDesktopCategoryOverflow,
  hasDiscoveryExplorationStarted,
  hasDiscoverySearch,
  highlightedDiscoveryMarkerKey,
  isBrandingImageBlocked,
  isCategoryRowExpanded,
  isClusterResultsActive,
  isDgfyCustomerSignedIn,
  isDiscoveryMobileViewport,
  isDiscoveryNavMenuOpen,
  isDiscoverySearchFocused,
  isDiscoveryTabletViewport,
  isMobileViewport,
  loadStores,
  markBrandingImageError,
  mobileCategoryGroupIndex,
  mobileCategoryRailRef,
  normalizeStorefrontCategories,
  normalizeStorefrontReviewSummary,
  openBusinessRegistrationFlow,
  openCanonicalDgfyAuth,
  openCustomerDashboard,
  openDiscoveryFaqIndex,
  search,
  searchRef,
  setDebouncedDiscoverySearch,
  setHasDiscoveryExplorationStarted,
  setHighlightedDiscoveryMarkerKey,
  setHighlightedStoreSlug,
  setIsCategoryRowExpanded,
  setIsDiscoveryNavMenuOpen,
  setIsDiscoverySearchFocused,
  setMobileCategoryGroupIndex,
  setOpenDiscoveryFaqIndex,
  setSearch,
  showDesktopCategoryOverflowCue,
  stableHeroDiscoveryMapPins,
  storesWithNearestBranch,
  toSlug,
  withAssetOrigin
}) {
  return (
    <>
      <DiscoveryHeader
        viewportMode={discoveryViewportMode}
        logoSrc={dgfyHeaderLogo}
        onLogoClick={() => goDiscovery()}
        navItems={['Explore', 'Solutions', 'Contact Us']}
        activeItem={activeDiscoveryNavItem === 'Contact Us' ? 'Explore' : activeDiscoveryNavItem}
        isAuthenticated={isDgfyCustomerSignedIn}
        accountLabel="My Account"
        accountName={accountIdentityName}
        accountInitials={accountIdentityInitials}
        accountSubtitle={accountIdentityRawEmail || accountIdentityContact}
        authLabel="Log in / Sign up"
        menuOpen={isDiscoveryNavMenuOpen}
        onMenuToggle={handleDiscoveryMenuToggle}
        onItemClick={handleDiscoveryNavItemClick}
        onAuthClick={() => {
          setIsDiscoveryNavMenuOpen(false);
          if (isDgfyCustomerSignedIn) {
            openCustomerDashboard();
            return;
          }
          openCanonicalDgfyAuth('customer');
        }}
      />

      {activeDiscoveryNavItem === 'Solutions' ? (
        <SolutionsPage
          logoSrc={dgfyHeaderLogo}
          onExploreClick={handleDiscoveryExploreClick}
          isMobileViewport={isMobileViewport}
        />
      ) : (
        <>
          <DiscoveryExploreStage
            desktopCategoryRailRef={desktopCategoryRailRef}
            discoveryCoords={discoveryCoords}
            discoveryInteractiveAreaRef={discoveryInteractiveAreaRef}
            discoveryLayout={discoveryLayout}
            discoveryResultsRendererProps={discoveryResultsRendererProps}
            discoveryViewportMode={discoveryViewportMode}
            getDiscoveryMarkerKey={getDiscoveryMarkerKey}
            goStore={goStore}
            handleDiscoverySearch={handleDiscoverySearch}
            handleNearMe={handleNearMe}
            handlePopularDiscoveryCategory={handlePopularDiscoveryCategory}
            hasDesktopCategoryOverflow={hasDesktopCategoryOverflow}
            hasDiscoveryExplorationStarted={hasDiscoveryExplorationStarted}
            hasDiscoverySearch={hasDiscoverySearch}
            highlightedDiscoveryMarkerKey={highlightedDiscoveryMarkerKey}
            isCategoryRowExpanded={isCategoryRowExpanded}
            isClusterResultsActive={isClusterResultsActive}
            isDiscoveryMobileViewport={isDiscoveryMobileViewport}
            isDiscoverySearchFocused={isDiscoverySearchFocused}
            isDiscoveryTabletViewport={isDiscoveryTabletViewport}
            isMobileViewport={isMobileViewport}
            loadStores={loadStores}
            mobileCategoryGroupIndex={mobileCategoryGroupIndex}
            mobileCategoryRailRef={mobileCategoryRailRef}
            search={search}
            searchRef={searchRef}
            setDebouncedDiscoverySearch={setDebouncedDiscoverySearch}
            setHasDiscoveryExplorationStarted={setHasDiscoveryExplorationStarted}
            setHighlightedDiscoveryMarkerKey={setHighlightedDiscoveryMarkerKey}
            setHighlightedStoreSlug={setHighlightedStoreSlug}
            setIsCategoryRowExpanded={setIsCategoryRowExpanded}
            setIsDiscoverySearchFocused={setIsDiscoverySearchFocused}
            setMobileCategoryGroupIndex={setMobileCategoryGroupIndex}
            setSearch={setSearch}
            showDesktopCategoryOverflowCue={showDesktopCategoryOverflowCue}
            stableHeroDiscoveryMapPins={stableHeroDiscoveryMapPins}
            storesWithNearestBranch={storesWithNearestBranch}
          />

          <DiscoveryLandingSections
            dgfyBusinessOwnerPhoto={dgfyBusinessOwnerPhoto}
            dgfyHeaderLogo={dgfyHeaderLogo}
            dgfySymbolLogo={dgfySymbolLogo}
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
            handleFeaturedCategoryFilter={handleFeaturedCategoryFilter}
            isBrandingImageBlocked={isBrandingImageBlocked}
            isMobileViewport={isMobileViewport}
            markBrandingImageError={markBrandingImageError}
            normalizeStorefrontCategories={normalizeStorefrontCategories}
            normalizeStorefrontReviewSummary={normalizeStorefrontReviewSummary}
            openBusinessRegistrationFlow={openBusinessRegistrationFlow}
            openDiscoveryFaqIndex={openDiscoveryFaqIndex}
            setOpenDiscoveryFaqIndex={setOpenDiscoveryFaqIndex}
            toSlug={toSlug}
            withAssetOrigin={withAssetOrigin}
          />
        </>
      )}
    </>
  );
}
