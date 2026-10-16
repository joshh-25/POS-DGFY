import React from 'react';
import { X } from 'lucide-react';

export function StorefrontTransactionExpiredModal({ open = false, onClose }) {
  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(15, 23, 42, 0.55)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="storefront-transaction-expired-title"
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 20px 35px -12px rgba(15, 23, 42, 0.3)', position: 'relative' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div id="storefront-transaction-expired-title" style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>
            Transaction expired
          </div>
          <button
            type="button"
            aria-label="Close transaction expired message"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', color: '#64748b', padding: 2 }}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
        <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, marginBottom: 24 }}>
          Your verification code expired. We returned you to Step 1 so you can request a new code and continue checkout.
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ width: '100%', minHeight: 44, borderRadius: 12, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          Back to Step 1
        </button>
      </div>
    </div>
  );
}
