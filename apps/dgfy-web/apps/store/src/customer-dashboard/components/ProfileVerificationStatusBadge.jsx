import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function ProfileVerificationStatusBadge({ theme, profileVerification, compact = false }) {
  const isFullyVerified = profileVerification?.isFullyVerified === true;
  const completed = Number(profileVerification?.completed || 0);
  const total = Number(profileVerification?.total || 3);
  const scoreLabel = `${completed}/${total}`;
  const statusLabel = isFullyVerified ? 'Verified' : compact ? scoreLabel : `Profile Score: ${scoreLabel}`;

  return (
    <span data-testid="customer-profile-verification-status" aria-label={isFullyVerified ? 'Verified' : `Profile Score: ${scoreLabel}`} style={{ background: isFullyVerified ? theme.primary : theme.infoBg, color: isFullyVerified ? '#FFF' : theme.primary, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 700, padding: '4px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', whiteSpace: 'nowrap', flexShrink: 0 }}>
      <ShieldCheck size={13} /> {statusLabel}
    </span>
  );
}
