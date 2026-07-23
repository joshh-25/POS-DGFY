import React from 'react';

import { DiscoveryHero } from '../../Components/store/DiscoveryResponsiveLayout.jsx';
import { DiscoveryInteractiveStage } from './DiscoveryInteractiveStage.jsx';

function DiscoveryHeroTitle() {
  return (
    <>
      Discover{' '}
      <span
        style={{
          background: 'linear-gradient(135deg, #1a4e8d, #1a4e8d)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}
      >
        Goods
      </span>
      {' '}For You
    </>
  );
}

export function DiscoveryExploreStage({
  desktopCategoryRailRef,
  discoveryCoords,
  discoveryInteractiveAreaRef,
  discoveryLayout,
  discoveryResultsRendererProps,
  discoveryViewportMode,
  getDiscoveryMarkerKey,
  goStore,
  handleDiscoverySearch,
  handleNearMe,
  handlePopularDiscoveryCategory,
  hasDesktopCategoryOverflow,
  hasDiscoveryExplorationStarted,
  hasDiscoverySearch,
  highlightedDiscoveryMarkerKey,
  isCategoryRowExpanded,
  isClusterResultsActive,
  isDiscoveryMobileViewport,
  isDiscoverySearchFocused,
  isDiscoveryTabletViewport,
  isMobileViewport,
  loadStores,
  mobileCategoryGroupIndex,
  mobileCategoryRailRef,
  search,
  searchRef,
  setDebouncedDiscoverySearch,
  setHasDiscoveryExplorationStarted,
  setHighlightedDiscoveryMarkerKey,
  setHighlightedStoreSlug,
  setIsCategoryRowExpanded,
  setIsDiscoverySearchFocused,
  setMobileCategoryGroupIndex,
  setSearch,
  showDesktopCategoryOverflowCue,
  stableHeroDiscoveryMapPins,
  storesWithNearestBranch
}) {
  const isCollapsed = isDiscoverySearchFocused || hasDiscoverySearch || hasDiscoveryExplorationStarted;

  return (
    <section style={{ display: 'grid', gap: 0, paddingBottom: 8 }}>
      <div
        style={{
          display: 'none',
          overflow: 'hidden',
          maxHeight: isCollapsed ? 0 : 220,
          opacity: isCollapsed ? 0 : 1,
          paddingTop: isCollapsed ? 0 : (isMobileViewport ? 32 : 48),
          paddingBottom: isCollapsed ? 0 : (isMobileViewport ? 24 : 28),
          transition: 'all 500ms cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: isCollapsed ? 'none' : 'auto',
          textAlign: isMobileViewport ? 'left' : 'center'
        }}
      >
        <h1
          style={{
            margin: isMobileViewport ? '0' : '0 auto',
            fontSize: isMobileViewport ? 42 : 54,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 900,
            color: '#0f172a',
            maxWidth: isMobileViewport ? '100%' : 680,
            boxSizing: 'border-box'
          }}
        >
          <DiscoveryHeroTitle />
        </h1>
        <p style={{ margin: isMobileViewport ? '16px auto 0' : '14px auto 0', maxWidth: isMobileViewport ? 332 : 800, color: '#94a3b8', fontSize: isMobileViewport ? 14 : 16.5, lineHeight: isMobileViewport ? 1.45 : 1.6, boxSizing: 'border-box' }}>
          Find nearby products, services, and businesses-faster, smarter, and all in one place.
        </p>
      </div>

      <DiscoveryHero
        viewportMode={discoveryViewportMode}
        collapsed={isCollapsed}
        title={<DiscoveryHeroTitle />}
        subtitle="Find nearby products, services, and businesses-faster, smarter, and all in one place."
      />

      <DiscoveryInteractiveStage
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
        hasDiscoverySearch={hasDiscoverySearch}
        highlightedDiscoveryMarkerKey={highlightedDiscoveryMarkerKey}
        isCategoryRowExpanded={isCategoryRowExpanded}
        isClusterResultsActive={isClusterResultsActive}
        isDiscoveryMobileViewport={isDiscoveryMobileViewport}
        isDiscoverySearchFocused={isDiscoverySearchFocused}
        isDiscoveryTabletViewport={isDiscoveryTabletViewport}
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
    </section>
  );
}
