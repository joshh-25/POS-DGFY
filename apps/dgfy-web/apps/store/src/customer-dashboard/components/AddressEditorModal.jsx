import React from 'react';
import { X } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function AddressEditorModal({ isMobileViewport, theme: THEME, addressModalMode, addressDraft, setAddressDraft, onClose, onSubmit, renderAddressPinEditor, accountAddressActionId, fieldStyle }) {
  return (  <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: isMobileViewport ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobileViewport ? 0 : 16 }}>
    <div
      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease' }}
      onClick={() => onClose()}
    />
    <div
      style={{
        position: 'relative',
        background: THEME.surface,
        width: isMobileViewport ? '100%' : '100%',
        maxWidth: isMobileViewport ? '100%' : 'min(1440px, calc(100vw - 32px))',
        height: isMobileViewport ? 'auto' : 'calc(100dvh - 32px)',
        maxHeight: isMobileViewport ? 'calc(100dvh - 8px)' : 'calc(100dvh - 32px)',
        borderRadius: isMobileViewport ? '20px 20px 0 0' : 20,
        padding: isMobileViewport ? 12 : '16px 18px 14px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        animation: isMobileViewport ? 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'zoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'grid',
        gap: isMobileViewport ? 10 : 10,
        boxSizing: 'border-box',
        overflowY: isMobileViewport ? 'auto' : 'hidden',
        overscrollBehavior: 'contain'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitle, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitleWeight, color: THEME.text }}>
          {addressModalMode === 'create' ? 'Add New Address' : 'Edit Address'}
        </h3>
        <button type="button" aria-label="Close address editor" onClick={() => onClose()} style={{ background: THEME.bg, border: 'none', borderRadius: '50%', width: isMobileViewport ? 44 : 40, height: isMobileViewport ? 44 : 40, display: 'grid', placeItems: 'center', cursor: 'pointer', color: THEME.muted }}>
          <X size={18} />
        </button>
      </div>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10, minHeight: 0 }}>
        {renderAddressPinEditor?.({
          draft: addressDraft,
          onChange: setAddressDraft,
          mode: addressModalMode,
          showDefaultAddressNote: addressModalMode === 'create' && !isMobileViewport,
          renderFormRow: () => (
            <div style={{ display: 'grid', gap: isMobileViewport ? 10 : 12, gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.label, fontWeight: 700, color: THEME.text }}>
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
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.label, fontWeight: 700, color: THEME.text }}>
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
            <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, fontWeight: 600, color: THEME.text }}>Set as default address</div>
          </label>
        )}

        <div data-testid="address-editor-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10, marginTop: 0, paddingTop: 2 }}>
          <button type="button" onClick={() => onClose()} style={{ minWidth: isMobileViewport ? 104 : 112, minHeight: isMobileViewport ? 44 : 40, background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 8, padding: '0 16px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, color: THEME.text, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={accountAddressActionId === 'new' || !addressDraft.address_line}
            style={{ minWidth: isMobileViewport ? 136 : 148, minHeight: isMobileViewport ? 44 : 40, background: THEME.primary, border: 'none', borderRadius: 8, padding: '0 18px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, color: '#fff', cursor: (accountAddressActionId === 'new' || !addressDraft.address_line) ? 'not-allowed' : 'pointer', opacity: (accountAddressActionId === 'new' || !addressDraft.address_line) ? 0.6 : 1 }}
          >
            {accountAddressActionId === 'new' ? 'Saving...' : 'Save Address'}
          </button>
        </div>
      </form>
    </div>
  </div>  );
}
