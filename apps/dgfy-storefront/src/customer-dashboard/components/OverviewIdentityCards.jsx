import React from 'react';
import { Mail, Pencil, Phone, ShieldCheck } from 'lucide-react';
import { ProfileVerificationStatusBadge } from './ProfileVerificationStatusBadge.jsx';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function OverviewIdentityCards({ isMobileViewport, theme, accountIdentityInitials, accountIdentityName, accountPanel, overviewPhone, overviewEmail, profileVerification, setActiveNav }) {
  return (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: isMobileViewport ? 14 : 24 }}>
    <div style={{ position: 'relative', height: '100%', boxSizing: 'border-box', background: theme.surface, borderRadius: isMobileViewport ? 20 : 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 16 : 24, display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', gap: isMobileViewport ? 12 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 14 : 20, minWidth: 0, flex: 1, paddingRight: isMobileViewport ? 56 : 0 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: isMobileViewport ? 64 : 80, height: isMobileViewport ? 64 : 80, borderRadius: '50%', background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.heroMetric.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.heroMetric.desktop, fontWeight: 800 }}>
            {accountIdentityInitials}
          </div>
          {Boolean(accountPanel?.me?.is_email_verified) && (
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: isMobileViewport ? 20 : 24, height: isMobileViewport ? 20 : 24, borderRadius: '50%', background: theme.success, color: '#FFF', display: 'grid', placeItems: 'center', border: '2px solid #FFF' }}>
              <ShieldCheck size={14} strokeWidth={3} />
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: isMobileViewport ? 'nowrap' : 'wrap', minWidth: 0 }}>
            <div style={{ minWidth: 0, overflow: isMobileViewport ? 'hidden' : 'visible', textOverflow: isMobileViewport ? 'ellipsis' : 'clip', whiteSpace: isMobileViewport ? 'nowrap' : 'normal', fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.identityName.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.identityName.desktop, fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{accountIdentityName}</div>
            <ProfileVerificationStatusBadge isMobileViewport={isMobileViewport} compact={isMobileViewport} theme={theme} profileVerification={profileVerification} />
          </div>
          <div style={{ display: 'grid', gap: isMobileViewport ? 6 : 8, color: theme.muted, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary : CUSTOMER_DASHBOARD_TYPOGRAPHY.body }}>
            {overviewPhone ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <Phone size={16} /> {overviewPhone}
              </span>
            ) : null}
            {overviewEmail ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Mail size={16} /> {overviewEmail}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <button type="button" aria-label="Edit Profile" title="Edit Profile" onClick={() => setActiveNav('account')} style={{ position: isMobileViewport ? 'absolute' : 'static', top: isMobileViewport ? 16 : 'auto', right: isMobileViewport ? 16 : 'auto', background: 'transparent', border: `1px solid ${theme.border}`, color: theme.primary, borderRadius: 12, padding: isMobileViewport ? 0 : '8px 16px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', flexShrink: 0, width: isMobileViewport ? 48 : 'auto', height: isMobileViewport ? 48 : 'auto' }}>
        <Pencil size={isMobileViewport ? 18 : 16} strokeWidth={2.2} />
        {!isMobileViewport ? 'Edit Profile' : null}
      </button>
    </div>

  </div>
  );
}
