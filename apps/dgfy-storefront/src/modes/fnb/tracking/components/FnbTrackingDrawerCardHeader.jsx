import React from 'react';
import { CalendarDays, ChevronRight, Package } from 'lucide-react';

export function FnbTrackingDrawerCardHeader({ dateLabel, entryPin, logoSource, onViewOrder, status, storeName, totalAmount, withAssetOrigin }) {
  return (
    <button
      type="button"
      onClick={onViewOrder}
      aria-label={`Open ${storeName} order ${entryPin}`}
      className="tracking-drawer-card-action"
      style={{ position: 'relative', width: '100%', boxSizing: 'border-box', border: 'none', padding: '16px 46px 16px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', background: '#fff', textAlign: 'left', userSelect: 'none' }}
    >
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, border: '1px solid #e2e8f0' }}>
        {logoSource ? <img src={withAssetOrigin(logoSource)} alt={storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={20} color="#fff" />}
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{storeName}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>#{entryPin}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 4 }}><CalendarDays size={12} /> {dateLabel}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: status.color, background: status.bg, border: `1px solid ${status.border}`, borderRadius: 999, padding: '4px 8px 4px 10px', whiteSpace: 'nowrap' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.dot, flexShrink: 0 }} />
            {status.label}
          </span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{totalAmount}</div>
          </div>
        </div>
      </div>
      <ChevronRight size={20} color="#64748b" aria-hidden="true" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    </button>
  );
}
