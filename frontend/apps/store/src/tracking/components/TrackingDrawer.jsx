import React from 'react';
import { Info, Trash2, X } from 'lucide-react';
import { TrackingDrawerCard } from './TrackingDrawerCard.jsx';
import { TrackingDrawerEmptyState } from './TrackingDrawerEmptyState.jsx';

export function TrackingDrawer({
  isOpen,
  isMobileViewport,
  selectedStore,
  guestTrackedOrders,
  expandedGuestDrawerPins,
  onExpandedGuestDrawerPinsChange,
  onClose,
  openFullTrackingForPin,
  withAssetOrigin,
  money,
  isAccountTracking = false,
  onClearAllOrders
}) {
  if (!isOpen) return null;

  const orders = Array.isArray(guestTrackedOrders) ? guestTrackedOrders : [];
  const expandedPins = Array.isArray(expandedGuestDrawerPins) ? expandedGuestDrawerPins : [];
  const drawerWidth = isMobileViewport ? '100vw' : 500;

  return (
    <>
      <button type="button" aria-label="Close tracking drawer" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2498, border: 'none', background: 'rgba(15,23,42,0.30)', cursor: 'pointer' }} />
      <aside style={{ position: 'fixed', top: 0, right: 0, zIndex: 2499, width: drawerWidth, maxWidth: '100vw', height: '100dvh', background: '#f0f4f8', borderLeft: '1px solid #dbe5ee', boxShadow: '-20px 0 56px rgba(15,23,42,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden', overscrollBehavior: 'contain', fontFamily: 'inherit' }}>
        <header style={{ background: '#fff', borderBottom: '1px solid #e8f0f8', padding: isMobileViewport ? '16px 16px' : '20px 22px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.2 }}>In Progress Orders</div>
              <div style={{ marginTop: 4, fontSize: 13, color: '#64748b', fontWeight: 600 }}>{isAccountTracking ? 'Active orders linked to your DGFY account.' : 'Active guest orders saved on this device.'}</div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={18} /></button>
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: isMobileViewport ? '16px 14px' : '20px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {orders.length === 0 ? <TrackingDrawerEmptyState isAccountTracking={isAccountTracking} /> : orders.map((entry) => {
            const entryPin = String(entry.tracking_pin || '').trim().toUpperCase();
            const expanded = expandedPins.includes(entryPin);
            return (
              <TrackingDrawerCard
                key={`fnb-track-drawer-${entryPin}`}
                entry={entry}
                entryPin={entryPin}
                expanded={expanded}
                onToggle={() => onExpandedGuestDrawerPinsChange(expanded ? expandedPins.filter((pin) => pin !== entryPin) : [...expandedPins, entryPin])}
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

