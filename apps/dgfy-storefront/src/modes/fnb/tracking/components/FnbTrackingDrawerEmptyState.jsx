import React from 'react';
import { Package } from 'lucide-react';

export function FnbTrackingDrawerEmptyState({ isAccountTracking }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px', textAlign: 'center', gap: 14 }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Package size={32} color="#93c5fd" />
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>No active orders found.</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, maxWidth: 260 }}>
          {isAccountTracking ? 'No in-progress account orders yet. Enter a tracking PIN to load a specific order.' : 'Track an order using your order reference.'}
        </div>
      </div>
    </div>
  );
}
