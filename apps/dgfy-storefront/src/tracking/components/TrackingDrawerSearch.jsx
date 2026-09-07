import React from 'react';
import { Search, X } from 'lucide-react';

function normalizeSearchValue(value) {
  return String(value || '').trim().replace(/^#/, '').toLowerCase();
}

export function filterTrackingDrawerOrders(orders, query) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return orders;
  return orders.filter((entry) => [
    entry?.tracking_pin,
    entry?.store_name,
    entry?.store_slug
  ].some((value) => normalizeSearchValue(value).includes(normalizedQuery)));
}

export function isLikelyTrackingPin(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(String(value || '').trim().replace(/^#/, ''));
}

export function normalizeTrackingPinInput(value) {
  return String(value || '').trim().replace(/^#/, '').toUpperCase();
}

export function TrackingDrawerSearch({ isMobileViewport, onSearchOrderByPin, onSubmit, query, setQuery, showNoResults }) {
  const canTrackPin = Boolean(onSearchOrderByPin && isLikelyTrackingPin(query));

  return (
    <>
      <form onSubmit={onSubmit} style={{ position: 'relative' }}>
        <Search size={18} color="#64748b" aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          aria-label="Search orders by Order PIN or store name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by Order PIN or store name..."
          className="tracking-drawer-search-input"
          autoComplete="off"
          style={{ width: '100%', minHeight: 48, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff', color: '#0f172a', padding: isMobileViewport ? '0 42px 0 42px' : '0 46px 0 44px', fontSize: 14, fontWeight: 600, outlineColor: '#1d4ed8' }}
        />
        {query && (
          <button type="button" aria-label="Clear order search" onClick={() => setQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, border: 'none', borderRadius: 10, background: 'transparent', color: '#64748b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        )}
      </form>
      {showNoResults && (
        <div role="status" style={{ marginTop: -4, padding: isMobileViewport ? '4px 2px 0' : '4px 2px 0', fontSize: 12, lineHeight: 1.5, color: '#64748b' }}>
          <strong style={{ color: '#334155' }}>No matching active orders found.</strong>
          {canTrackPin ? ' Press Enter to track this PIN from the current storefront.' : ' Try another PIN or store name.'}
        </div>
      )}
    </>
  );
}
