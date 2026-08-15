import React from 'react';

import { StoreCatalogEmptyStates } from '../../../../features/shared-storefront/components/StoreCatalogEmptyStates.jsx';
import { isItemAvailable } from '../../../../shared/model/storefrontCatalogModel.js';
import { money } from '../../../../shared/utils/storefrontFormatters.js';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';
import { GhostButton } from '../../../../shared/components/StorefrontActionPrimitives.jsx';
import { STYLES } from '../../../../shared/theme/storefrontStyleTokens.js';
import { StorefrontCatalogToolbar } from '../../../../shared/components/storefront/StorefrontCatalogToolbar.jsx';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { FNB_CATEGORY_ICON_MAP } from '../model/fnbStorefrontPresentation.js';
import { FnbProductCard } from '../components/FnbProductCard.jsx';

export function FnbCatalogRoutePage({ addToCart, catalogError, catalogItems, catalogSearch, catalogState, filteredCatalog, filteredCatalogViewModel, getCartFlySourceRect, hasCatalogSearchQuery, isCategoryDropdownOpen, isCompactPaginationViewport, isDesktopViewport, isMobileViewport, isTabletPaginationViewport, modeAdapter, mobileCatalogPadding, mobileContentWidth, onCategoryChange, onCategoryDropdownOpenChange, onPageChange, onPageSizeChange, onSearchChange, onSortChange, onViewDetails, onViewModeChange, page, pageEnd, pageSize, pageStart, refreshStorePageForTenantSetup, resolvedSection, sortOption, totalItems, totalPages, viewMode, categoryDropdownRef }) {
  const paginationAccent = '#f97316';
  const paginationAccentShadow = 'rgba(249,115,22,0.22)';

  return (
    <section id="storefront-catalog-section" style={{ display: 'grid', gap: isMobileViewport ? 16 : 24, marginTop: isMobileViewport ? 0 : 34, background: '#fff', padding: isMobileViewport ? '20px 0 24px' : '32px 0 52px', marginLeft: isMobileViewport ? undefined : 'calc(50% - 50vw)', width: isMobileViewport ? '100%' : '100vw', boxSizing: 'border-box' }}>
      <StorefrontCatalogToolbar FNB_CATEGORY_ICON_MAP={FNB_CATEGORY_ICON_MAP} STYLES={STYLES} catalogSearch={catalogSearch} filteredFnbViewModel={filteredCatalogViewModel} fnbCategoryDropdownRef={categoryDropdownRef} fnbMobileMenuInnerWidth={mobileContentWidth} fnbSortOption={sortOption} fnbViewMode={viewMode} isFnbCategoryDropdownOpen={isCategoryDropdownOpen} isMobileViewport={isMobileViewport} modeAdapter={modeAdapter} resolvedFnbSection={resolvedSection} setActiveServiceTab={onCategoryChange} setCatalogSearch={onSearchChange} setFnbSortOption={onSortChange} setFnbViewMode={onViewModeChange} setIsFnbCategoryDropdownOpen={onCategoryDropdownOpenChange} showViewToggle />
      <StoreCatalogEmptyStates catalogState={catalogState} catalogError={catalogError} catalogSearch={catalogSearch} filteredCatalog={filteredCatalog} hasCatalogSearchQuery={hasCatalogSearchQuery} isMobileViewport={isMobileViewport} isServicesMode={false} onRefreshTenantPage={refreshStorePageForTenantSetup} />
      {(catalogState === 'ready' || catalogState === 'empty_no_match') && (
        <div style={{ maxWidth: 1320, margin: `${isMobileViewport ? 20 : 28}px auto 0`, width: '100%', boxSizing: 'border-box', padding: isMobileViewport ? mobileCatalogPadding : '0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: isMobileViewport ? 12 : 24, width: isMobileViewport ? mobileContentWidth : '100%', maxWidth: '100%', justifyItems: isMobileViewport ? 'center' : 'stretch', margin: isMobileViewport ? '0 auto' : 0 }}>
            {catalogItems.map((item) => <FnbProductCard key={`${item.item_id}-${viewMode}`} item={item} imageSources={resolveStorefrontImageSources(item, { preferred: 'thumbnail' })} available={isItemAvailable(item)} FNB_CATEGORY_ICON_MAP={FNB_CATEGORY_ICON_MAP} addToCart={addToCart} buttonTextOnAccent={(modeAdapter.heroTheme || {}).buttonTextOnAccent || '#fffdf9'} getCartFlySourceRect={getCartFlySourceRect} heroTheme={modeAdapter.heroTheme || {}} isMobileViewport={isMobileViewport} fnbViewMode={viewMode} money={money} onViewDetails={onViewDetails} />)}
            {catalogItems.length === 0 && <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 48, color: STYLES.colors.muted }}>No menu items match the current search or section yet.</div>}
          </div>
          {totalItems > 0 && totalPages > 1 && (
            <div style={{ marginTop: isMobileViewport ? 20 : 36, display: 'grid', gap: isCompactPaginationViewport ? 8 : 12, padding: isCompactPaginationViewport ? '12px 0' : isTabletPaginationViewport ? '14px 0' : '16px 0', paddingBottom: isCompactPaginationViewport ? 20 : 12, width: isMobileViewport ? mobileContentWidth : '100%', margin: isMobileViewport ? '0 auto' : 0, boxSizing: 'border-box' }}>
              <FnbCatalogPagination currentPage={page} end={pageEnd} isCompactPaginationViewport={isCompactPaginationViewport} isDesktopViewport={isDesktopViewport} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} pageSize={pageSize} pageStart={pageStart} totalItems={totalItems} totalPages={totalPages} isMobileViewport={isMobileViewport} paginationAccent={paginationAccent} paginationAccentShadow={paginationAccentShadow} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FnbCatalogPagination({ currentPage, end, isCompactPaginationViewport, isDesktopViewport, isMobileViewport, onPageChange, onPageSizeChange, pageSize, pageStart, totalItems, totalPages, paginationAccent, paginationAccentShadow }) {
  const pageWindowSize = isCompactPaginationViewport ? 3 : 5;
  const pageWindowOffset = isCompactPaginationViewport ? 1 : 2;
  const compactVisiblePages = !isCompactPaginationViewport || totalPages <= 4
    ? []
    : currentPage <= 3
      ? [1, 2, 3]
      : currentPage >= totalPages - 2
        ? [Math.max(1, totalPages - 3), Math.max(1, totalPages - 2), Math.max(1, totalPages - 1)]
        : [currentPage - 1, currentPage, currentPage + 1];
  const pageSliceStart = Math.max(0, currentPage - pageWindowOffset - 1);
  const visiblePages = isCompactPaginationViewport
    ? (totalPages <= 4 ? Array.from({ length: totalPages }, (_, index) => index + 1) : compactVisiblePages.filter((pageNumber, index, pages) => Number.isFinite(pageNumber) && pageNumber > 0 && pageNumber < totalPages && pages.indexOf(pageNumber) === index))
    : Array.from({ length: totalPages }, (_, index) => index + 1).slice(pageSliceStart, pageSliceStart + pageWindowSize);
  const showLeadingFirstPage = !isCompactPaginationViewport && visiblePages.length > 0 && visiblePages[0] > 1;
  const showLeadingEllipsis = !isCompactPaginationViewport && visiblePages.length > 0 && visiblePages[0] > 2;
  const showTrailingEllipsis = visiblePages.length > 0 && visiblePages[visiblePages.length - 1] < totalPages - 1;
  const showTrailingLastPage = visiblePages.length > 0 && visiblePages[visiblePages.length - 1] < totalPages;
  const buttonStyle = { minWidth: isCompactPaginationViewport ? 36 : 40, minHeight: isCompactPaginationViewport ? 36 : 40, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', color: STYLES.colors.dark, fontWeight: 500, fontSize: 14, cursor: 'pointer', flexShrink: 0, padding: isCompactPaginationViewport ? '0 10px' : '0 12px' };
  const pageButton = (pageNumber, key) => <button key={key} type="button" onClick={() => onPageChange(pageNumber)} style={{ ...buttonStyle, border: `1px solid ${pageNumber === currentPage ? paginationAccent : '#e5e7eb'}`, background: pageNumber === currentPage ? paginationAccent : '#fff', color: pageNumber === currentPage ? '#fff' : STYLES.colors.dark, boxShadow: pageNumber === currentPage ? `0 8px 18px ${paginationAccentShadow}` : 'none' }}>{pageNumber}</button>;
  const controls = <><GhostButton style={{ ...buttonStyle, opacity: currentPage === 1 ? 0.5 : 1 }} onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>Previous</GhostButton>{showLeadingFirstPage && pageButton(1, 'fnb-page-leading')}{showLeadingEllipsis && <div style={{ padding: '0 4px', color: '#94a3b8', fontWeight: 500 }}>...</div>}{visiblePages.map((pageNumber) => pageButton(pageNumber, `fnb-page-${pageNumber}`))}{showTrailingEllipsis && <div style={{ padding: '0 4px', color: '#94a3b8', fontWeight: 500 }}>...</div>}{showTrailingLastPage && pageButton(totalPages, 'fnb-page-trailing')}<GhostButton style={{ ...buttonStyle, opacity: currentPage === totalPages ? 0.5 : 1 }} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>Next</GhostButton></>;
  return <><div style={{ display: 'grid', gridTemplateColumns: isDesktopViewport ? '1fr auto 1fr' : isCompactPaginationViewport ? 'minmax(0, 1fr) auto' : '1fr', gap: isCompactPaginationViewport ? 8 : 12, alignItems: 'center' }}><div style={{ fontSize: 13, color: STYLES.colors.muted, lineHeight: 1.4, textAlign: 'left', minWidth: 0 }}>Showing {pageStart}-{end} of {totalItems} items</div>{isDesktopViewport && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>{controls}</div>}<div style={{ display: 'flex', justifyContent: isDesktopViewport ? 'flex-end' : isCompactPaginationViewport ? 'flex-end' : 'flex-start' }}><label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: STYLES.colors.muted, flexShrink: 0 }}>Per page<StorefrontDropdown value={pageSize} onChange={(nextValue) => onPageSizeChange(Number(nextValue) || 8)} options={[4, 8, 12, 16].map((size) => ({ value: size, label: String(size) }))} containerStyle={{ minWidth: isCompactPaginationViewport ? 66 : 72 }} triggerStyle={{ minHeight: isCompactPaginationViewport ? 36 : 40, borderRadius: 12, minWidth: isCompactPaginationViewport ? 66 : 72, padding: '6px 34px 6px 12px' }} menuStyle={{ borderRadius: 14 }} selectedLabelStyle={{ fontSize: 13 }} /></label></div></div>{!isDesktopViewport && <div className="no-scrollbar" style={{ display: 'flex', alignItems: 'center', justifyContent: isCompactPaginationViewport ? 'flex-start' : 'center', gap: isCompactPaginationViewport ? 6 : 8, width: '100%', flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>{controls}</div>}</>;
}
