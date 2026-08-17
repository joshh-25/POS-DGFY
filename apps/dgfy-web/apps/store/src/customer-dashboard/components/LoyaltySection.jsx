import React from 'react';
import { Award } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function LoyaltySection({ isMobileViewport, loyalty, transactions, EmptyState, formatDate, prettyStatus, theme }) {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitleWeight, color: theme.text, marginBottom: 8 }}>Loyalty Rewards</h2>
      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 80, height: 80, borderRadius: 16, background: theme.successBg, color: theme.success, display: 'grid', placeItems: 'center' }}><Award size={40} /></div>
          <div>
            <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, color: theme.muted, fontWeight: 500, marginBottom: 4 }}>Current Balance</div>
            <div style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.heroMetric.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.heroMetric.desktop, fontWeight: 900, color: theme.text, lineHeight: 1 }}>{Number(loyalty.balance || 0)} <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, color: theme.muted, fontWeight: 500 }}>Points</span></div>
          </div>
        </div>
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 16px', color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: 700 }}>Rewards redemption is currently in development.</div>
      </div>
      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitle.desktop, fontWeight: 700, color: theme.text, marginBottom: 16 }}>Recent Transactions</h3>
        <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {transactions.length === 0 ? <EmptyState title="No transactions yet" desc="Make a purchase to start earning points." /> : transactions.map((entry, index) => (
            <div key={`loy-${entry.transaction_id || index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: index < transactions.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
              <div><div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{prettyStatus(entry.reason || 'Activity')}</div><div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: theme.muted }}>{formatDate(entry.created_at)}</div></div>
              <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: 700, color: Number(entry.points_delta || 0) >= 0 ? theme.success : theme.text }}>{Number(entry.points_delta || 0) >= 0 ? '+' : ''}{Number(entry.points_delta || 0)} pts</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
