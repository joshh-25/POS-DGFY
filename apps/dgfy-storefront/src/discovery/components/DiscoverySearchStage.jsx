import React from 'react';
import { Navigation, Search, X } from 'lucide-react';

import { DiscoverySearchRegion } from '../../Components/store/DiscoveryResponsiveLayout.jsx';
import { DiscoveryCategoryStage } from './DiscoveryCategoryStage.jsx';

export function DiscoverySearchStage({
  desktopCategoryRailRef,
  discoveryLayout,
  discoveryViewportMode,
  handleDiscoverySearch,
  handleNearMe,
  handlePopularDiscoveryCategory,
  hasDesktopCategoryOverflow,
  isCategoryRowExpanded,
  isDiscoveryMobileViewport,
  isDiscoverySearchFocused,
  loadStores,
  mobileCategoryGroupIndex,
  mobileCategoryRailRef,
  search,
  searchRef,
  setDebouncedDiscoverySearch,
  setHasDiscoveryExplorationStarted,
  setIsCategoryRowExpanded,
  setIsDiscoverySearchFocused,
  setMobileCategoryGroupIndex,
  setSearch,
  showDesktopCategoryOverflowCue
}) {
  return (
                  <DiscoverySearchRegion viewportMode={discoveryViewportMode}>
                  <div style={{ width: '100%', minWidth: 0, padding: discoveryLayout.searchPadding, boxSizing: 'border-box' }}>

                      {/* Input row */}
                      <div style={{ maxWidth: discoveryLayout.searchMaxWidth, margin: '0 auto', width: '100%', minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                        alignItems: 'center',
                        gap: 0,
                        background: '#fff',
                        border: '1.5px solid',
                        borderColor: isDiscoverySearchFocused ? '#1a4e8d' : '#e2e8f0',
                        borderRadius: 14,
                        padding: '3px 4px 3px 16px',
                        boxShadow: isDiscoverySearchFocused
                          ? '0 0 0 4px rgba(59,130,246,.10), 0 8px 30px rgba(15,23,42,.09)'
                          : '0 2px 12px rgba(15,23,42,.07)',
                        transition: 'border-color 220ms ease, box-shadow 220ms ease'
                      }}
                    >
                      <Search
                        size={18}
                        style={{
                          color: isDiscoverySearchFocused ? '#1a4e8d' : '#94a3b8',
                          flexShrink: 0,
                          transition: 'color 220ms ease'
                        }}
                      />
                      <input
                        id="discovery-search-input"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          searchRef.current = e.target.value;
                        }}
                        onFocus={(e) => {
                          setIsDiscoverySearchFocused(true);
                          setHasDiscoveryExplorationStarted(true);
                          const inputEl = e.currentTarget;
                          const textLength = String(inputEl.value || '').length;
                          if (!textLength) return;
                          // Keep caret editable after repeated searches: avoid full-text select replacement.
                          requestAnimationFrame(() => {
                            const isAllSelected = inputEl.selectionStart === 0 && inputEl.selectionEnd === textLength;
                            if (isAllSelected) {
                              inputEl.setSelectionRange(textLength, textLength);
                            }
                          });
                        }}
                        onBlur={() => setTimeout(() => setIsDiscoverySearchFocused(false), 180)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleDiscoverySearch(); }}
                        placeholder="Search products, services or stores nearby..."
                        autoComplete="off"
                        style={{
                          flex: 1,
                          border: 'none',
                          outline: 'none',
                          fontSize: isDiscoveryMobileViewport ? 16 : 15,
                          color: '#0f172a',
                          background: 'transparent',
                          padding: '7px 10px',
                          minWidth: 0
                        }}
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={() => { setSearch(''); setDebouncedDiscoverySearch(''); loadStores(undefined, { useImmediateSearch: true }); }}
                          style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px', display: 'inline-flex', marginRight: 4 }}
                        >
                          <X size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleNearMe}
                        title="Use my current location"
                        style={{ border: 'none', background: 'none', color: '#1a4e8d', cursor: 'pointer', padding: '6px', display: isDiscoveryMobileViewport ? 'none' : 'inline-flex', marginRight: 4 }}
                      >
                        <Navigation size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={handleDiscoverySearch}
                        style={{
                          borderRadius: 12,
                          border: 'none',
                          background: '#1a4e8d',
                          color: '#fff',
                          padding: isDiscoveryMobileViewport ? '9px 16px' : discoveryViewportMode === 'tablet' ? '10px 20px' : '10px 24px',
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          boxShadow: '0 8px 20px rgba(37,99,235,.25)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          letterSpacing: '0.01em',
                          transition: 'all 200ms ease'
                        }}
                      >
                        <Search size={16} />
                          Search
                        </button>
                      </div>
                      </div>
                      <DiscoveryCategoryStage
                        desktopCategoryRailRef={desktopCategoryRailRef}
                        discoveryViewportMode={discoveryViewportMode}
                        handlePopularDiscoveryCategory={handlePopularDiscoveryCategory}
                        hasDesktopCategoryOverflow={hasDesktopCategoryOverflow}
                        isCategoryRowExpanded={isCategoryRowExpanded}
                        isDiscoveryMobileViewport={isDiscoveryMobileViewport}
                        mobileCategoryGroupIndex={mobileCategoryGroupIndex}
                        mobileCategoryRailRef={mobileCategoryRailRef}
                        setIsCategoryRowExpanded={setIsCategoryRowExpanded}
                        setMobileCategoryGroupIndex={setMobileCategoryGroupIndex}
                        showDesktopCategoryOverflowCue={showDesktopCategoryOverflowCue}
                      />
                </div>
                  </DiscoverySearchRegion>
  );
}
