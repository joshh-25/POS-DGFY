import React, { useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { PayoutMethodEditorModal } from './PayoutMethodEditorModal.jsx';
import { PayoutMethodCard, PayoutMethodCardEmpty } from './PayoutMethodCard.jsx';
import {
  createPayoutMethodDraft,
  getPayoutMethodActionMeta,
  getPayoutMethodSubtitle,
  getPayoutMethodTitle
} from '../model/payoutMethodPresentation.js';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function PayoutMethodsSection({
  payoutMethods,
  onSavePayoutMethod,
  onDeletePayoutMethod,
  onSetDefaultPayoutMethod,
  accountPayoutActionId,
  isMobileViewport,
  theme
}) {
  const THEME = theme;
  const allMethods = Array.isArray(payoutMethods) ? payoutMethods : [];
  const [payoutDraft, setPayoutDraft] = useState(createPayoutMethodDraft());
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [payoutModalMode, setPayoutModalMode] = useState('create');
  const [deletingPayoutMethodId, setDeletingPayoutMethodId] = useState(null);
  const fieldStyle = { width: '100%', minHeight: 44, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '0 14px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, color: THEME.text, outline: 'none', boxSizing: 'border-box', background: THEME.surface, transition: 'border-color 0.2s' };

  const sortedMethods = [...allMethods].sort((a, b) => {
    if (a.is_default) return -1;
    if (b.is_default) return 1;
    return 0;
  });

  const handleOpenAddModal = () => {
    setPayoutModalMode('create');
    setPayoutDraft(createPayoutMethodDraft());
    setIsPayoutModalOpen(true);
  };

  const handleOpenEditModal = (method) => {
    setPayoutModalMode(`edit-${method.payout_method_id}`);
    setPayoutDraft(createPayoutMethodDraft(method));
    setIsPayoutModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const draftPayload = { ...payoutDraft };
    if (payoutModalMode === 'create') draftPayload.is_default = true;

    const isEdit = String(payoutModalMode).startsWith('edit-');
    const targetMethod = isEdit ? allMethods.find((entry) => entry.payout_method_id === payoutDraft.payout_method_id) : null;

    const success = await onSavePayoutMethod?.(draftPayload, targetMethod);
    if (success !== false) setIsPayoutModalOpen(false);
  };

  const confirmDelete = async (method) => {
    await onDeletePayoutMethod?.(method);
    setDeletingPayoutMethodId(null);
  };

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitleWeight, color: THEME.text }}>Payout Methods</h2>
          <p style={{ margin: '6px 0 0', color: THEME.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.pageSubtitle }}>Where your affiliate cashouts get sent. Add a bank account or e-wallet, and mark one as default.</p>
        </div>
          <button type="button" onClick={handleOpenAddModal} style={{ background: THEME.primary, color: '#fff', border: 'none', borderRadius: 10, minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 18px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Plus size={16} /> Add Payout Method
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {sortedMethods.length === 0 ? (
          <PayoutMethodCardEmpty />
        ) : sortedMethods.map((method) => {
          const isDeleting = deletingPayoutMethodId === method.payout_method_id;
          const actionMeta = getPayoutMethodActionMeta(accountPayoutActionId);
          const isActionTarget = actionMeta.id === String(method.payout_method_id);
          const busy = isDeleting || isActionTarget;

          return (
            <div key={`payout-method-${method.payout_method_id}`} style={{ display: 'grid', gap: 10 }}>
              <PayoutMethodCard
                method={{
                  payout_method_id: method.payout_method_id,
                  method_type: method.method_type,
                  title: getPayoutMethodTitle(method),
                  subtitle: getPayoutMethodSubtitle(method),
                  isDefault: Boolean(method.is_default)
                }}
                isBusy={busy}
                onSetDefault={!method.is_default ? () => onSetDefaultPayoutMethod?.(method) : undefined}
                onEdit={() => handleOpenEditModal(method)}
                onRemove={() => setDeletingPayoutMethodId(method.payout_method_id)}
                themeColor={THEME.primary}
                themeBg="#eff6ff"
              />
              {isDeleting ? (
                <div style={{ marginTop: -2, padding: '0 8px 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: 600, color: THEME.orange }}>Delete this payout method?</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setDeletingPayoutMethodId(null)} style={{ minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, border: `1px solid ${THEME.border}`, background: 'transparent', padding: '0 12px', borderRadius: 8, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => confirmDelete(method)} style={{ minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, border: 'none', background: THEME.orange, color: '#fff', padding: '0 12px', borderRadius: 8, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: THEME.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>
        <Lock size={14} /> Your payout details are private and secure.
      </div>

      {isPayoutModalOpen ? (
        <PayoutMethodEditorModal
          isMobileViewport={isMobileViewport}
          theme={THEME}
          payoutModalMode={payoutModalMode}
          payoutDraft={payoutDraft}
          setPayoutDraft={setPayoutDraft}
          onClose={() => setIsPayoutModalOpen(false)}
          onSubmit={handleSubmit}
          accountPayoutActionId={accountPayoutActionId}
          fieldStyle={fieldStyle}
        />
      ) : null}
    </div>
  );
}

export default PayoutMethodsSection;
