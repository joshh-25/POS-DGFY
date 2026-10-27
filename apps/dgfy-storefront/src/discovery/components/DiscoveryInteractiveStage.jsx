import React from 'react';

import { DiscoveryHeroMapStage } from './DiscoveryHeroMapStage.jsx';
import { DiscoverySearchStage } from './DiscoverySearchStage.jsx';
import { DiscoveryRouteContainer } from '../pages/DiscoveryRouteContainer.jsx';
import { resolveDiscoveryCategoryFilterValue } from '../../features/discovery/utils/storefrontDiscoveryNormalization.js';

export function DiscoveryInteractiveStage({
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
  hasDiscoveryResultsStage,
  highlightedDiscoveryMarkerKey,
  isCategoryRowExpanded,
  isClusterResultsActive,
  isDiscoveryMobileViewport,
  isDiscoverySearchFocused,
  isDiscoveryTabletViewport,
  mobileCategoryGroupIndex,
  mobileCategoryRailRef,
  search,
  searchRef,
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
  const stageGap = isDiscoveryMobileViewport ? 10 : isDiscoveryTabletViewport ? 12 : 12;
  const stickyTop = isDiscoveryMobileViewport ? 'calc(env(safe-area-inset-top, 0px) + 8px)' : discoveryLayout.navOffset;
  const activeCategoryFilter = discoveryResultsRendererProps.discoveryCategoryFilter || 'all';
  const resetDiscoverySearch = discoveryResultsRendererProps.resetDiscoverySearch;
  const handleCategoryClick = (category) => {
    if (resolveDiscoveryCategoryFilterValue(category) === activeCategoryFilter) {
      resetDiscoverySearch?.();
      return;
    }
    handlePopularDiscoveryCategory(category);
  };

  return (
    <div ref={discoveryInteractiveAreaRef} style={{ display: 'grid', gap: stageGap, width: '100%', minWidth: 0 }}>
      <div style={{ position: 'sticky', top: stickyTop, zIndex: 49, backgroundColor: '#ffffff', display: 'grid', gap: stageGap, width: '100%', minWidth: 0 }}>
        <DiscoverySearchStage
          desktopCategoryRailRef={desktopCategoryRailRef}
          discoveryLayout={discoveryLayout}
          discoveryViewportMode={discoveryViewportMode}
          handleDiscoverySearch={handleDiscoverySearch}
          handleNearMe={handleNearMe}
          handlePopularDiscoveryCategory={handleCategoryClick}
          activeDiscoveryCategoryFilter={activeCategoryFilter}
          clearDiscoverySearch={resetDiscoverySearch}
          hasActiveDiscoveryFilters={discoveryResultsRendererProps.hasActiveDiscoveryFilters}
          hasDesktopCategoryOverflow={hasDesktopCategoryOverflow}
          isCategoryRowExpanded={isCategoryRowExpanded}
          isDiscoveryMobileViewport={isDiscoveryMobileViewport}
          isDiscoverySearchFocused={isDiscoverySearchFocused}
          mobileCategoryGroupIndex={mobileCategoryGroupIndex}
          mobileCategoryRailRef={mobileCategoryRailRef}
          search={search}
          searchRef={searchRef}
          setHasDiscoveryExplorationStarted={setHasDiscoveryExplorationStarted}
          setIsCategoryRowExpanded={setIsCategoryRowExpanded}
          setIsDiscoverySearchFocused={setIsDiscoverySearchFocused}
          setMobileCategoryGroupIndex={setMobileCategoryGroupIndex}
          setSearch={setSearch}
          showDesktopCategoryOverflowCue={showDesktopCategoryOverflowCue}
        />

        {!hasDiscoveryResultsStage && !isClusterResultsActive && (
          <DiscoveryHeroMapStage
            discoveryCoords={discoveryCoords}
            discoveryLayout={discoveryLayout}
            discoveryViewportMode={discoveryViewportMode}
            cameraSnapshotRef={discoveryResultsRendererProps.discoveryCameraSnapshotRef}
            preserveCameraOnMount={discoveryResultsRendererProps.preserveDiscoveryCamera}
            getDiscoveryMarkerKey={getDiscoveryMarkerKey}
            goStore={goStore}
            handleDiscoveryClusterSelect={discoveryResultsRendererProps.handleDiscoveryClusterSelect}
            handleNearMe={handleNearMe}
            highlightedDiscoveryMarkerKey={highlightedDiscoveryMarkerKey}
            isDiscoveryMobileViewport={isDiscoveryMobileViewport}
            setHasDiscoveryExplorationStarted={setHasDiscoveryExplorationStarted}
            setHighlightedDiscoveryMarkerKey={setHighlightedDiscoveryMarkerKey}
            setHighlightedStoreSlug={setHighlightedStoreSlug}
            stableHeroDiscoveryMapPins={stableHeroDiscoveryMapPins}
            storesWithNearestBranch={storesWithNearestBranch}
          />
        )}

        {(hasDiscoveryResultsStage || isClusterResultsActive) && (
          <DiscoveryRouteContainer rendererProps={discoveryResultsRendererProps} />
        )}
      </div>
    </div>
  );
}
