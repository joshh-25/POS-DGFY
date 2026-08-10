import React from 'react';
import { CheckCircle2, X } from 'lucide-react';

export function AddressEditorModal({ isMobileViewport, theme: THEME, addressModalMode, addressDraft, setAddressDraft, onClose, onSubmit, renderAddressPinEditor, accountAddressActionId, fieldStyle }) {
  return (  <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: isMobileViewport ? 'flex-end' : 'center', justifyContent: 'center' }}>
    <div
      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease' }}
      onClick={() => onClose()}
    />
    <div
      style={{
        position: 'relative',
        background: THEME.surface,
        width: '100%',
        maxWidth: isMobileViewport ? '100%' : 480,
        borderRadius: isMobileViewport ? '24px 24px 0 0' : 24,
        padding: '24px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        animation: isMobileViewport ? 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'zoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'grid',
        gap: 20
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: THEME.text }}>
          {addressModalMode === 'create' ? 'Add New Address' : 'Edit Address'}
        </h3>
        <button onClick={() => onClose()} style={{ background: THEME.bg, border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'grid', placeItems: 'center', cursor: 'pointer', color: THEME.muted }}>
          <X size={18} />
        </button>
      </div>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
        {renderAddressPinEditor?.({
          draft: addressDraft,
          onChange: setAddressDraft,
          mode: addressModalMode,
          renderFormRow: ({ isExpanded } = {}) => (
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: isExpanded ? '1fr 1fr' : '1fr' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: THEME.text }}>
                <div>Full Delivery Address</div>
                <input
                  id="dgfy-modal-address-line"
                  autoFocus
                  value={String(addressDraft.address_line || '')}
                  onChange={(e) => setAddressDraft(p => ({ ...p, address_line: e.target.value }))}
                  placeholder="e.g. 123 Main St, City, Province"
                  style={fieldStyle}
                  required
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: THEME.text }}>
                <div>Label / Landmark / Unit <span style={{ color: THEME.muted, fontWeight: 500 }}>(optional)</span></div>
                <input
                  value={addressDraft.label}
                  onChange={(e) => setAddressDraft(p => ({ ...p, label: e.target.value }))}
                  placeholder="e.g. Home, Office, Near Plaza"
                  style={fieldStyle}
                />
              </label>
            </div>
          )
        })}

        {addressModalMode !== 'create' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 16px', background: THEME.bg, borderRadius: 12, marginTop: 4 }}>
            <input
              type="checkbox"
              checked={addressDraft.is_default}
              onChange={(e) => setAddressDraft(p => ({ ...p, is_default: e.target.checked }))}
              style={{ width: 18, height: 18, accentColor: THEME.primary }}
            />
            <div style={{ fontSize: 14, fontWeight: 600, color: THEME.text }}>Set as default address</div>
          </label>
        )}

        {addressModalMode === 'create' && (
          <div style={{ fontSize: 13, background: THEME.infoBg, color: THEME.info, padding: '10px 14px', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            This will be set as your default address automatically.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <button type="button" onClick={() => onClose()} style={{ background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, color: THEME.text, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={accountAddressActionId === 'new' || !addressDraft.address_line}
            style={{ background: THEME.primary, border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: (accountAddressActionId === 'new' || !addressDraft.address_line) ? 'not-allowed' : 'pointer', opacity: (accountAddressActionId === 'new' || !addressDraft.address_line) ? 0.6 : 1 }}
          >
            {accountAddressActionId === 'new' ? 'Saving...' : 'Save Address'}
          </button>
        </div>
      </form>
    </div>
  </div>  );
}
