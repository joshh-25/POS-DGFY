import React from 'react';
import { Percent } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const ACCESS_COPY = {
  loading: {
    label: 'Checking access',
    title: 'Checking affiliate access',
    description: 'We are checking whether an active affiliate enrollment is linked to this account.'
  },
  error: {
    label: 'Access unavailable',
    title: 'Affiliate access could not be verified',
    description: 'We could not confirm your affiliate enrollment right now, so affiliate tools remain hidden. Refresh the page and try again.'
  },
  unavailable: {
    label: 'Not available',
    title: 'Affiliate access is not available yet',
    description: 'No active affiliate enrollment is linked to your DGFY account.'
  }
};

export function AffiliateAccessState({ status = 'unavailable', isMobileViewport, theme }) {
  const normalizedStatus = status === 'loading' || status === 'unknown' ? 'loading' : status === 'error' ? 'error' : 'unavailable';
  const copy = ACCESS_COPY[normalizedStatus];
  const isLoading = normalizedStatus === 'loading';

  return (
    <section
      data-testid="customer-affiliate-access-state"
      data-state={normalizedStatus}
      role={isLoading ? 'status' : undefined}
      aria-busy={isLoading}
      style={{
        width: '100%',
        maxWidth: 760,
        margin: '0 auto',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: isMobileViewport ? '1fr' : '56px minmax(0, 1fr)',
        gap: isMobileViewport ? 16 : 20,
        alignItems: 'start',
        padding: isMobileViewport ? 20 : 28,
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        background: theme.surface,
        textAlign: isMobileViewport ? 'center' : 'left'
      }}
    >
      <div style={{ width: 56, height: 56, margin: isMobileViewport ? '0 auto' : 0, borderRadius: 16, display: 'grid', placeItems: 'center', background: normalizedStatus === 'error' ? theme.orangeBg : theme.infoBg, color: normalizedStatus === 'error' ? theme.orange : theme.primary }}>
        <Percent size={26} aria-hidden="true" />
      </div>
      <div
        data-testid="customer-affiliate-access-copy"
        style={{ minWidth: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobileViewport ? 'center' : 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitleWeight, lineHeight: 1.3 }}>{copy.title}</h3>
          {!isLoading ? <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '2px 8px', borderRadius: 999, background: normalizedStatus === 'error' ? theme.orangeBg : theme.bg, color: normalizedStatus === 'error' ? theme.orange : theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 700 }}>{copy.label}</span> : null}
        </div>
        <p style={{ margin: '8px 0 0', color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, lineHeight: 1.55 }}>{copy.description}</p>
        {!isLoading && normalizedStatus !== 'error' ? (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: theme.bg, textAlign: 'left' }}>
            <div style={{ color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: 700 }}>What happens next</div>
            <ol style={{ margin: '8px 0 0', paddingLeft: 20, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, lineHeight: 1.55 }}>
              <li>A business owner invites and adds your DGFY account as an affiliate.</li>
              <li>After your enrollment becomes active, referral links, QR codes, earnings, and cashouts will appear here.</li>
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default AffiliateAccessState;
