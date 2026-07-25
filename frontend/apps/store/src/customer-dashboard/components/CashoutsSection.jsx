import React from 'react';
import { Banknote } from 'lucide-react';
import { getPayoutMethodTitle } from '../model/payoutMethodPresentation.js';

// Matches the platform default (tenant_affiliate_settings.min_cashout_centavos)
// documented in the backend study - a soft client-side hint only. The
// backend is still the source of truth and enforces the store's actual
// configured minimum on every request.
const DEFAULT_MIN_CASHOUT_CENTAVOS = 20000;

const centavosToPesos = (value) => Number(value || 0) / 100;

function RequestCashoutRow({ enrollment, storeEarnings, onRequestCashout, accountCashoutActionId, money, theme, isMobileViewport }) {
  const businessName = enrollment?.tenant?.name || 'Business';
  const availableCentavos = Number(storeEarnings?.available_centavos || 0);
  const belowMinimum = availableCentavos < DEFAULT_MIN_CASHOUT_CENTAVOS;
  const busy = accountCashoutActionId === `request:${enrollment.tenant_id}`;

  return (
    <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 16 : 20, display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{businessName}</div>
        <div style={{ fontSize: 13, color: theme.muted, marginTop: 2 }}>Available: <span style={{ fontWeight: 700, color: theme.success }}>{money(centavosToPesos(availableCentavos))}</span></div>
        {belowMinimum ? <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>Minimum {money(centavosToPesos(DEFAULT_MIN_CASHOUT_CENTAVOS))} to cash out.</div> : null}
      </div>
      <button
        type="button"
        disabled={belowMinimum || busy}
        onClick={() => onRequestCashout?.({ tenantId: enrollment.tenant_id })}
        style={{ background: theme.primary, border: 'none', color: '#FFFFFF', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: (belowMinimum || busy) ? 'not-allowed' : 'pointer', opacity: (belowMinimum || busy) ? 0.5 : 1, flexShrink: 0 }}
      >
        {busy ? 'Requesting...' : 'Request Cashout'}
      </button>
    </div>
  );
}

function CashoutHistoryRow({ cashout, tenantName, onCancelCashout, accountCashoutActionId, money, formatDate, StatusBadge, theme, isMobileViewport }) {
  const busy = accountCashoutActionId === `cancel:${cashout.cashout_id}`;
  return (
    <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 16 : 20, display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{tenantName || 'Business'}</div>
          <StatusBadge status={cashout.status} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: theme.text, marginTop: 6 }}>{money(centavosToPesos(cashout.amount_centavos))}</div>
        {cashout.payout_snapshot ? <div style={{ fontSize: 13, color: theme.muted, marginTop: 2 }}>{getPayoutMethodTitle(cashout.payout_snapshot)}</div> : null}
        <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>Requested {formatDate(cashout.requested_at)}</div>
        {cashout.status === 'paid' && cashout.external_payment_ref ? <div style={{ fontSize: 12, color: theme.muted }}>Ref: {cashout.external_payment_ref}</div> : null}
        {cashout.status === 'rejected' && cashout.rejection_reason ? <div style={{ fontSize: 12, color: theme.orange }}>{cashout.rejection_reason}</div> : null}
      </div>
      {cashout.status === 'requested' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancelCashout?.(cashout)}
          style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.orange, borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1, flexShrink: 0 }}
        >
          {busy ? 'Cancelling...' : 'Cancel'}
        </button>
      ) : null}
    </div>
  );
}

export function CashoutsSection({
  enrollments = [],
  earningsByStore = [],
  cashouts = [],
  onRequestCashout,
  onCancelCashout,
  accountCashoutActionId,
  isMobileViewport,
  EmptyState,
  StatusBadge,
  money,
  formatDate,
  theme
}) {
  const earningsByTenant = new Map(earningsByStore.map((entry) => [String(entry.tenant_id), entry.earnings]));
  const tenantNameById = new Map(enrollments.map((entry) => [String(entry.tenant_id), entry?.tenant?.name || 'Business']));
  const activeEnrollments = enrollments.filter((entry) => entry.status === 'active');
  const sortedCashouts = [...cashouts].sort((a, b) => new Date(b.requested_at || 0) - new Date(a.requested_at || 0));

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginBottom: 12 }}>Request a Cashout</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          {activeEnrollments.length === 0 ? (
            <EmptyState title="No active businesses yet" desc="Once you're an active affiliate for a business, you can request a cashout here." />
          ) : activeEnrollments.map((enrollment) => (
            <RequestCashoutRow
              key={enrollment.enrollment_id}
              enrollment={enrollment}
              storeEarnings={earningsByTenant.get(String(enrollment.tenant_id))}
              onRequestCashout={onRequestCashout}
              accountCashoutActionId={accountCashoutActionId}
              money={money}
              theme={theme}
              isMobileViewport={isMobileViewport}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginBottom: 12 }}>Cashout History</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          {sortedCashouts.length === 0 ? (
            <EmptyState title="No cashouts yet" desc="Requested cashouts will show up here." />
          ) : sortedCashouts.map((cashout) => (
            <CashoutHistoryRow
              key={cashout.cashout_id}
              cashout={cashout}
              tenantName={tenantNameById.get(String(cashout.tenant_id))}
              onCancelCashout={onCancelCashout}
              accountCashoutActionId={accountCashoutActionId}
              money={money}
              formatDate={formatDate}
              StatusBadge={StatusBadge}
              theme={theme}
              isMobileViewport={isMobileViewport}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme.muted, fontSize: 12 }}>
        <Banknote size={14} /> A cashout reserves your full available balance for that business at request time.
      </div>
    </div>
  );
}

export default CashoutsSection;
