import React from 'react';

import { StoreCatalogEmptyState } from './StoreCatalogEmptyState.jsx';

export function StoreCatalogEmptyStates({
  catalogState,
  catalogError,
  catalogSearch,
  filteredCatalog,
  hasCatalogSearchQuery,
  isMobileViewport,
  isServicesMode,
  onRefreshTenantPage
}) {
  const wrapperStyle = {
    maxWidth: 1320,
    margin: `${isMobileViewport ? 18 : 24}px auto 0`,
    width: '100%',
    padding: isMobileViewport ? '0 16px' : '0 24px'
  };
  const searchQuery = String(catalogSearch || '').trim();

  if (catalogState === 'loading') {
    return (
      <div style={wrapperStyle} aria-live="polite" aria-busy="true">
        <StoreCatalogEmptyState mode="refreshing" />
      </div>
    );
  }

  if (catalogState === 'empty_setup') {
    return (
      <div style={wrapperStyle}>
        <StoreCatalogEmptyState mode="setup_pending" onRefreshTenantPage={onRefreshTenantPage} />
      </div>
    );
  }

  if (catalogState === 'empty_search_on_zero') {
    return (
      <div style={wrapperStyle}>
        <StoreCatalogEmptyState
          mode="search_on_empty"
          searchQuery={searchQuery}
          onRefreshTenantPage={onRefreshTenantPage}
        />
      </div>
    );
  }

  if (isServicesMode && filteredCatalog.length === 0 && !catalogError) {
    return (
      <div style={wrapperStyle}>
        <StoreCatalogEmptyState
          mode={hasCatalogSearchQuery ? 'search_on_empty' : 'setup_pending'}
          searchQuery={searchQuery}
          onRefreshTenantPage={onRefreshTenantPage}
        />
      </div>
    );
  }

  return null;
}
