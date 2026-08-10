import React from 'react';
import { StoresMap } from './StoresMap.jsx';

export function StorefrontExpandedMapModal({
  open,
  onClose,
  title = 'Large Map',
  subtitle = 'View the store location in a larger map.',
  stores,
  selectedKey
}) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(15,23,42,0.46)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: 'min(980px, 100%)', maxHeight: '90vh', overflow: 'auto', borderRadius: 20, background: '#fff', border: '1px solid #dbe5ee', boxShadow: '0 26px 60px rgba(15,23,42,0.22)', padding: 20, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#1e293b' }}>{title}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{subtitle}</div>
          </div>
          <button type="button" onClick={onClose} style={{ minHeight: 40, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>
            Close
          </button>
        </div>
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #dbe5ee', background: '#f8fafc' }}>
          <StoresMap stores={stores} selectedKey={selectedKey} onSelectStore={() => {}} height={520} />
        </div>
      </div>
    </div>
  );
}
