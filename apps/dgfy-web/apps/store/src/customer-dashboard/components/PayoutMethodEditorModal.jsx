import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { PAYOUT_METHOD_TYPES, getPayoutMethodTypeLabel } from '../model/payoutMethodPresentation.js';

const isDraftValid = (draft) => {
  if (draft.method_type === 'bank') {
    return Boolean(String(draft.bank_name || '').trim() && String(draft.account_name || '').trim() && String(draft.account_number || '').trim());
  }
  return Boolean(String(draft.mobile_number || '').trim());
};

export function PayoutMethodEditorModal({ isMobileViewport, theme: THEME, payoutModalMode, payoutDraft, setPayoutDraft, onClose, onSubmit, accountPayoutActionId, fieldStyle }) {
  const isCreate = payoutModalMode === 'create';
  const valid = isDraftValid(payoutDraft);
  const saving = accountPayoutActionId === 'new';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: isMobileViewport ? 'flex-end' : 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => onClose()} />
      <div style={{ position: 'relative', background: THEME.surface, width: '100%', maxWidth: isMobileViewport ? '100%' : 480, borderRadius: isMobileViewport ? '24px 24px 0 0' : 24, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: THEME.text }}>{isCreate ? 'Add Payout Method' : 'Edit Payout Method'}</h3>
          <button onClick={() => onClose()} style={{ background: THEME.bg, border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'grid', placeItems: 'center', cursor: 'pointer', color: THEME.muted }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: THEME.text }}>
            <div>Method Type</div>
            <select
              value={payoutDraft.method_type}
              onChange={(e) => setPayoutDraft((p) => ({ ...p, method_type: e.target.value }))}
              style={fieldStyle}
            >
              {PAYOUT_METHOD_TYPES.map((type) => (
                <option key={type} value={type}>{getPayoutMethodTypeLabel(type)}</option>
              ))}
            </select>
          </label>

          {payoutDraft.method_type === 'bank' ? (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: THEME.text }}>
                <div>Bank Name</div>
                <input autoFocus value={payoutDraft.bank_name} onChange={(e) => setPayoutDraft((p) => ({ ...p, bank_name: e.target.value }))} placeholder="e.g. BDO, BPI" style={fieldStyle} required />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: THEME.text }}>
                <div>Account Name</div>
                <input value={payoutDraft.account_name} onChange={(e) => setPayoutDraft((p) => ({ ...p, account_name: e.target.value }))} placeholder="Name on the account" style={fieldStyle} required />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: THEME.text }}>
                <div>Account Number</div>
                <input value={payoutDraft.account_number} onChange={(e) => setPayoutDraft((p) => ({ ...p, account_number: e.target.value }))} placeholder="Account number" style={fieldStyle} required />
              </label>
            </>
          ) : (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: THEME.text }}>
              <div>Mobile Number</div>
              <input autoFocus value={payoutDraft.mobile_number} onChange={(e) => setPayoutDraft((p) => ({ ...p, mobile_number: e.target.value }))} placeholder="e.g. 09171234567" style={fieldStyle} required />
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: THEME.text }}>
            <div>Label <span style={{ color: THEME.muted, fontWeight: 500 }}>(optional)</span></div>
            <input value={payoutDraft.label} onChange={(e) => setPayoutDraft((p) => ({ ...p, label: e.target.value }))} placeholder="e.g. Main account" style={fieldStyle} />
          </label>

          {!isCreate && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 16px', background: THEME.bg, borderRadius: 12, marginTop: 4 }}>
              <input type="checkbox" checked={payoutDraft.is_default} onChange={(e) => setPayoutDraft((p) => ({ ...p, is_default: e.target.checked }))} style={{ width: 18, height: 18, accentColor: THEME.primary }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: THEME.text }}>Set as default payout method</div>
            </label>
          )}

          {isCreate && (
            <div style={{ fontSize: 13, background: THEME.infoBg, color: THEME.info, padding: '10px 14px', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              Your first payout method will be set as default automatically.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
            <button type="button" onClick={() => onClose()} style={{ background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, color: THEME.text, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving || !valid} style={{ background: THEME.primary, border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: (saving || !valid) ? 'not-allowed' : 'pointer', opacity: (saving || !valid) ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Save Payout Method'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PayoutMethodEditorModal;
