import React from 'react';
import { Package } from 'lucide-react';

export function TrackingDrawerOrderLines({ entryPin, items, money, withAssetOrigin }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px 80px', gap: 8, padding: '10px 0 8px', borderBottom: '1px solid #e2e8f0', marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Products</div>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>QTY</div>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Subtotal</div>
      </div>
      {items.length > 0 ? items.map((item, index) => {
        const itemLogo = item.image_url || item.thumbnail;
        const variantLabel = String(item.variant || item.size || item.variant_name || item.subtitle || '').trim();
        const quantity = item.qty || item.quantity || 1;
        const amount = item.amount != null ? money(item.amount) : null;
        return (
          <div key={`${entryPin}-item-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px 80px', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: index < items.length - 1 ? '1px dashed #f1f5f9' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {itemLogo ? <img src={withAssetOrigin(itemLogo)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={16} color="#94a3b8" />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, wordBreak: 'break-word' }}>{item.name}</div>
                {variantLabel && <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 2 }}>{variantLabel}</div>}
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', textAlign: 'center' }}>{quantity}x</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', textAlign: 'right' }}>{amount || '-'}</div>
          </div>
        );
      }) : <div style={{ padding: '16px 0', fontSize: 12, color: '#64748b', textAlign: 'center' }}>Line items are available in the full tracking view.</div>}
    </>
  );
}

