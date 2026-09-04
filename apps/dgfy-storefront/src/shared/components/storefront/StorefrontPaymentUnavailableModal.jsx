import React from 'react';
import { X } from 'lucide-react';

export function StorefrontPaymentUnavailableModal({ open = false, onClose }) {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 20, width: '90%', maxWidth: 400, padding: 24, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Payment Unavailable</div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', color: '#64748b' }}>
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
        <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, marginBottom: 24 }}>
          Online payment is not yet available. Please use cash on delivery/pickup for now.
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ width: '100%', minHeight: 44, borderRadius: 12, border: 'none', background: '#cbd5e1', color: '#1e293b', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          Okay
        </button>
      </div>
    </div>
  );
}
