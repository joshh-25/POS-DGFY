import React from 'react';

import { StoreCatalogEmptyStates } from '../../../../features/shared-storefront/components/StoreCatalogEmptyStates.jsx';
import { isItemAvailable } from '../../../../shared/model/storefrontCatalogModel.js';
import { money } from '../../../../shared/utils/storefrontFormatters.js';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';
import { SimpleCatalogPagination } from '../components/SimpleCatalogPagination.jsx';
import { SimpleCatalogToolbar } from '../components/SimpleCatalogToolbar.jsx';
import { SimpleProductCard } from '../components/SimpleProductCard.jsx';

export function SimpleCatalogRoutePage({ addToCart, catalogError, catalogItems, catalogSearch, catalogState, filteredCatalog, filteredCatalogViewModel, getCartFlySourceRect, hasCatalogSearchQuery, isCategoryDropdownOpen, isMobileViewport, modeAdapter, onCategoryChange, onCategoryDropdownOpenChange, onPageChange, onPageSizeChange, onSearchChange, onSortChange, onViewDetails, onViewModeChange, page, pageEnd, pageSize, pageStart, refreshStorePageForTenantSetup, resolvedSection, sortOption, totalItems, totalPages, viewMode, categoryDropdownRef, mobileContentWidth }) {
  return (
    <section id="storefront-catalog-section" style={{ display: 'grid', gap: isMobileViewport ? 16 : 24, background: '#fff', padding: isMobileViewport ? '20px 0 24px' : '32px 0 52px', marginLeft: isMobileViewport ? undefined : 'calc(50% - 50vw)', width: isMobileViewport ? '100%' : '100vw', boxSizing: 'border-box' }}>
      <SimpleCatalogToolbar catalogSearch={catalogSearch} categoryDropdownRef={categoryDropdownRef} filteredCatalogViewModel={filteredCatalogViewModel} isCategoryDropdownOpen={isCategoryDropdownOpen} isMobileViewport={isMobileViewport} modeAdapter={modeAdapter} resolvedSection={resolvedSection} sortOption={sortOption} viewMode={viewMode} onCategoryChange={onCategoryChange} onCategoryDropdownOpenChange={onCategoryDropdownOpenChange} onSearchChange={onSearchChange} onSortChange={onSortChange} onViewModeChange={onViewModeChange} />
      <StoreCatalogEmptyStates catalogState={catalogState} catalogError={catalogError} catalogSearch={catalogSearch} filteredCatalog={filteredCatalog} hasCatalogSearchQuery={hasCatalogSearchQuery} isMobileViewport={isMobileViewport} isServicesMode={false} onRefreshTenantPage={refreshStorePageForTenantSetup} />
      {(catalogState === 'ready' || catalogState === 'empty_no_match') && (
        <div style={{ maxWidth: 1320, margin: `${isMobileViewport ? 16 : 24}px auto 0`, width: '100%', padding: isMobileViewport ? '0 16px' : '0 24px', boxSizing: 'border-box' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: isMobileViewport ? 12 : 24, width: isMobileViewport ? mobileContentWidth : '100%', margin: '0 auto' }}>
            {catalogItems.map((item) => <SimpleProductCard key={`${item.item_id}-${viewMode}`} item={item} imageSources={resolveStorefrontImageSources(item, { preferred: 'thumbnail' })} available={isItemAvailable(item)} addToCart={addToCart} buttonTextOnAccent={modeAdapter.heroTheme?.buttonTextOnAccent || '#fff'} fnbViewMode={viewMode} getCartFlySourceRect={getCartFlySourceRect} heroTheme={modeAdapter.heroTheme || {}} isMobileViewport={isMobileViewport} money={money} onViewDetails={onViewDetails} />)}
          </div>
          {catalogItems.length === 0 && <div style={{ padding: '36px 16px', textAlign: 'center', color: '#64748b' }}>No simple-mode products match the current search yet.</div>}
          <SimpleCatalogPagination currentPage={page} end={pageEnd} isMobileViewport={isMobileViewport} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} pageSize={pageSize} start={pageStart} totalItems={totalItems} totalPages={totalPages} />
        </div>
      )}
    </section>
  );
}
