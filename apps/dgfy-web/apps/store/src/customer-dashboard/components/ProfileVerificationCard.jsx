import React from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const VERIFICATION_ITEMS = [
  { key: 'emailVerified', label: 'Email' },
  { key: 'phoneVerified', label: 'Phone' },
  { key: 'idVerified', label: 'Valid ID' }
];

export function ProfileVerificationCard({ isMobileViewport, theme, profileVerification }) {
  const completed = Number(profileVerification?.completed || 0);
  const total = Number(profileVerification?.total || VERIFICATION_ITEMS.length);
  const percentage = Number(profileVerification?.percentage || 0);
  const isFullyVerified = profileVerification?.isFullyVerified === true;

  return (
    <section
      data-testid="customer-profile-verification-score"
      aria-label="Profile verification score"
      style={{
        border: `1px solid ${theme.infoBg}`,
        borderRadius: isMobileViewport ? 16 : 18,
        padding: isMobileViewport ? 16 : 20,
        background: 'rgba(174, 232, 244, 0.2)',
        display: 'grid',
        gap: 14
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(174, 232, 244, 0.55)', color: theme.info, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <ShieldCheck size={20} strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ color: theme.text, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitleWeight }}>Profile setup score</div>
            <div style={{ marginTop: 4, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary }}>
              {isFullyVerified ? 'Your profile is fully verified.' : 'Verify all three items to complete your profile.'}
            </div>
          </div>
        </div>
        <strong style={{ color: theme.info, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.metric.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.metric.desktop, whiteSpace: 'nowrap' }}>
          {completed}/{total}
        </strong>
      </div>

      <div
        role="progressbar"
        aria-label="Profile verification progress"
        aria-valuemin="0"
        aria-valuemax={total}
        aria-valuenow={completed}
        style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: 'rgba(255, 255, 255, 0.75)' }}
      >
        <div style={{ width: `${percentage}%`, height: '100%', borderRadius: 999, background: theme.info, transition: 'width 180ms ease' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: isMobileViewport ? 8 : 12 }}>
        {VERIFICATION_ITEMS.map((item) => {
          const verified = profileVerification?.[item.key] === true;
          return (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, color: verified ? theme.info : theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, fontWeight: 700 }}>
              <CheckCircle2 size={15} strokeWidth={2.3} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
