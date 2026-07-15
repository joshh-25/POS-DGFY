import React from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Package } from 'lucide-react';

export function FnbTrackingDrawerCardHeader({ dateLabel, entryPin, expanded, logoSource, onToggle, status, storeName, totalAmount, withAssetOrigin }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onToggle(); }}
      style={{ padding: '16px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', background: expanded ? '#f8fbff' : '#fff', userSelect: 'none' }}
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
            {expanded ? <ChevronUp size={14} style={{ marginLeft: 2, color: status.color }} /> : <ChevronDown size={14} style={{ marginLeft: 2, color: status.color }} />}
          </span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{totalAmount}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>Total Amount</div>
          </div>
        </div>
      </div>
    </div>
  );
}
