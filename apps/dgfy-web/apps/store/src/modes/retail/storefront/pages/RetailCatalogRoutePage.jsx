import React from 'react';

import { StoreCatalogEmptyStates } from '../../../../features/shared-storefront/components/StoreCatalogEmptyStates.jsx';
import { isItemAvailable } from '../../../../shared/model/storefrontCatalogModel.js';
import { money } from '../../../../shared/utils/storefrontFormatters.js';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';
import { FNB_CATEGORY_ICON_MAP } from '../../../fnb/storefront/model/fnbStorefrontPresentation.js';
import { RetailCatalogPagination } from '../components/RetailCatalogPagination.jsx';
import { RetailCatalogToolbar } from '../components/RetailCatalogToolbar.jsx';
import { RetailProductCard } from '../components/RetailProductCard.jsx';

export function RetailCatalogRoutePage({ addToCart, catalogError, catalogItems, catalogSearch, catalogState, filteredCatalog, filteredCatalogViewModel, getCartFlySourceRect, hasCatalogSearchQuery, isCategoryDropdownOpen, isMobileViewport, mobileCatalogPadding, mobileContentWidth, modeAdapter, onCategoryChange, onCategoryDropdownOpenChange, onPageChange, onPageSizeChange, onSearchChange, onSortChange, onViewDetails, onViewModeChange, page, pageEnd, pageSize, pageStart, refreshStorePageForTenantSetup, resolvedSection, sortOption, totalItems, totalPages, viewMode, categoryDropdownRef, viewportWidth }) {
  return (
    <section id="storefront-catalog-section" style={{ display: 'grid', gap: isMobileViewport ? 16 : 24, marginTop: isMobileViewport ? 0 : 34, background: '#fff', padding: isMobileViewport ? '20px 0 24px' : '32px 0 52px', marginLeft: isMobileViewport ? undefined : 'calc(50% - 50vw)', width: isMobileViewport ? '100%' : '100vw', boxSizing: 'border-box' }}>
      <RetailCatalogToolbar catalogSearch={catalogSearch} filteredFnbViewModel={filteredCatalogViewModel} fnbCategoryDropdownRef={categoryDropdownRef} fnbSortOption={sortOption} fnbViewMode={viewMode} isFnbCategoryDropdownOpen={isCategoryDropdownOpen} isMobileViewport={isMobileViewport} modeAdapter={modeAdapter} resolvedFnbSection={resolvedSection} setActiveServiceTab={onCategoryChange} setCatalogSearch={onSearchChange} setFnbSortOption={onSortChange} setFnbViewMode={onViewModeChange} setIsFnbCategoryDropdownOpen={onCategoryDropdownOpenChange} />
      <StoreCatalogEmptyStates catalogState={catalogState} catalogError={catalogError} catalogSearch={catalogSearch} filteredCatalog={filteredCatalog} hasCatalogSearchQuery={hasCatalogSearchQuery} isMobileViewport={isMobileViewport} isServicesMode={false} onRefreshTenantPage={refreshStorePageForTenantSetup} />
      {(catalogState === 'ready' || catalogState === 'empty_no_match') && (
        <div style={{ maxWidth: 1320, margin: `${isMobileViewport ? 20 : 28}px auto 0`, width: '100%', padding: isMobileViewport ? mobileCatalogPadding : '0 24px', boxSizing: 'border-box' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : viewportWidth < 1200 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isMobileViewport ? 12 : 24, width: isMobileViewport ? mobileContentWidth : '100%', maxWidth: '100%', justifyItems: isMobileViewport ? 'center' : 'stretch', margin: isMobileViewport ? '0 auto' : 0 }}>
            {catalogItems.map((item) => <RetailProductCard key={`${item.item_id}-${viewMode}`} item={item} imageSources={resolveStorefrontImageSources(item, { preferred: 'thumbnail' })} available={isItemAvailable(item)} FNB_CATEGORY_ICON_MAP={FNB_CATEGORY_ICON_MAP} addToCart={addToCart} buttonTextOnAccent={modeAdapter.heroTheme?.buttonTextOnAccent || '#ffffff'} fnbViewMode={viewMode} getCartFlySourceRect={getCartFlySourceRect} heroTheme={modeAdapter.heroTheme || {}} isMobileViewport={isMobileViewport} money={money} onViewDetails={onViewDetails} />)}
          </div>
          {catalogItems.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>No products available in this category yet.</div>}
          <RetailCatalogPagination currentPage={page} end={pageEnd} isMobileViewport={isMobileViewport} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} pageSize={pageSize} start={pageStart} totalItems={totalItems} totalPages={totalPages} />
        </div>
      )}
    </section>
  );
}
