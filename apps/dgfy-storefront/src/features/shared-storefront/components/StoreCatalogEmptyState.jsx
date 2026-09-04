import React from 'react';

export function StoreCatalogEmptyState({ mode = 'setup_pending', searchQuery = '', onRefreshTenantPage }) {
  const normalizedMode = String(mode || 'setup_pending').trim().toLowerCase();
  const isRefreshing = normalizedMode === 'refreshing';
  const title = isRefreshing
    ? 'Loading branch menu'
    : normalizedMode === 'search_on_empty'
    ? 'No items are available to search yet'
    : 'Storefront items are not set up yet';
  const description = isRefreshing
    ? 'We’re loading the latest menu for this branch. Your storefront shell will stay in place while it refreshes.'
    : normalizedMode === 'search_on_empty'
    ? `No catalog is published for this tenant yet, so search for "${searchQuery}" cannot return results.`
    : 'This tenant has not configured any storefront-visible items yet. Ask the tenant admin to enable items for storefront selling.';

  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid #cbd5e1',
        borderRadius: 14,
        background: 'linear-gradient(180deg,#f8fafc 0%,#ffffff 100%)',
        padding: 16
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isRefreshing ? (
          <span
            aria-hidden="true"
            style={{
              width: 16,
              height: 16,
              flex: '0 0 auto',
              border: '2px solid #fed7aa',
              borderTopColor: '#f97316',
              borderRadius: '999px',
              animation: 'storefrontCatalogRefreshSpin 0.8s linear infinite'
            }}
          />
        ) : null}
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{title}</div>
      </div>
      <p style={{ margin: '8px 0 0 0', color: '#475569', fontSize: 14 }}>{description}</p>
      {!isRefreshing ? (
        <>
          <div style={{ marginTop: 10, fontSize: 13, color: '#0f766e', fontWeight: 700 }}>
            Customer checkout will be available once at least one storefront item is enabled.
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={onRefreshTenantPage}
              style={{ borderRadius: 10, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 700 }}
            >
              Check Again
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
