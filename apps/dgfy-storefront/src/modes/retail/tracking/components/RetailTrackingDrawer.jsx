import React, { useMemo, useState } from 'react';
import { Info, Trash2, X } from 'lucide-react';
import { RetailTrackingDrawerCard } from './RetailTrackingDrawerCard.jsx';
import { RetailTrackingDrawerEmptyState } from './RetailTrackingDrawerEmptyState.jsx';
import { filterTrackingDrawerOrders, isLikelyTrackingPin, normalizeTrackingPinInput, TrackingDrawerSearch } from '../../../../tracking/components/TrackingDrawerSearch.jsx';

export function RetailTrackingDrawer({
  isOpen,
  isMobileViewport,
  selectedStore,
  guestTrackedOrders,
  onClose,
  openFullTrackingForPin,
  onSearchOrderByPin,
  withAssetOrigin,
  money,
  isAccountTracking = false,
  onClearAllOrders
}) {
  const orders = useMemo(() => (Array.isArray(guestTrackedOrders) ? guestTrackedOrders : []), [guestTrackedOrders]);
  const drawerWidth = isMobileViewport ? '100vw' : 500;
  const searchOrderByPin = onSearchOrderByPin || openFullTrackingForPin;
  const [searchQuery, setSearchQuery] = useState('');
  const visibleOrders = useMemo(() => filterTrackingDrawerOrders(orders, searchQuery), [orders, searchQuery]);
  const handleSearchSubmit = (event) => {
    event.preventDefault();
    if (!isLikelyTrackingPin(searchQuery) || !searchOrderByPin) return;
    const normalizedPin = normalizeTrackingPinInput(searchQuery);
    const hasLocalMatch = orders.some((entry) => normalizeTrackingPinInput(entry?.tracking_pin) === normalizedPin);
    if (!hasLocalMatch) searchOrderByPin(normalizedPin);
  };

  if (!isOpen) return null;

  return (
    <>
      <button type="button" aria-label="Close tracking drawer" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2498, border: 'none', background: 'rgba(15,23,42,0.30)', cursor: 'pointer' }} />
      <aside aria-label="In progress orders" style={{ position: 'fixed', top: 0, right: 0, zIndex: 2499, width: drawerWidth, maxWidth: '100vw', height: '100dvh', background: '#f0f4f8', borderLeft: '1px solid #dbe5ee', boxShadow: '-20px 0 56px rgba(15,23,42,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden', overscrollBehavior: 'contain', fontFamily: 'inherit' }}>
        <header style={{ background: '#fff', borderBottom: '1px solid #e8f0f8', padding: isMobileViewport ? '16px 16px' : '20px 22px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.2 }}>In Progress Orders</h2>
              <div style={{ marginTop: 4, fontSize: 13, color: '#64748b', fontWeight: 600 }}>{isAccountTracking ? 'Active orders linked to your DGFY account.' : 'Active guest orders saved on this device.'}</div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="tracking-drawer-close" style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={20} /></button>
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: isMobileViewport ? '16px 14px' : '20px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TrackingDrawerSearch isMobileViewport={isMobileViewport} onSearchOrderByPin={searchOrderByPin} onSubmit={handleSearchSubmit} query={searchQuery} setQuery={setSearchQuery} showNoResults={Boolean(searchQuery.trim()) && visibleOrders.length === 0} />
          {orders.length === 0 && !searchQuery.trim() ? <RetailTrackingDrawerEmptyState isAccountTracking={isAccountTracking} /> : visibleOrders.map((entry) => {
            const entryPin = String(entry.tracking_pin || '').trim().toUpperCase();
            return (
              <RetailTrackingDrawerCard
                key={`Retail-track-drawer-${entryPin}`}
                entry={entry}
                entryPin={entryPin}
                onViewOrder={() => openFullTrackingForPin(entryPin)}
                selectedStore={selectedStore}
                withAssetOrigin={withAssetOrigin}
                money={money}
              />
            );
          })}
        </main>
        <footer style={{ background: '#fff', borderTop: '1px solid #e8f0f8', padding: isMobileViewport ? '12px 16px' : '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, color: '#94a3b8', fontWeight: 600, lineHeight: 1.5, flex: 1 }}><Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />Only showing active orders. Completed orders are not displayed.</div>
          {onClearAllOrders && orders.length > 0 && <button type="button" onClick={onClearAllOrders} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #fca5a5', borderRadius: 8, background: '#fff', color: '#b91c1c', fontSize: 12, fontWeight: 700, padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}><Trash2 size={12} />Clear all orders</button>}
        </footer>
      </aside>
    </>
  );
}
