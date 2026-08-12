import React, { useState } from 'react';
import { Check, Edit2, Lock, Mail, Phone, ShieldCheck } from 'lucide-react';
import { AccountSettingsChangeModal } from './AccountSettingsChangeModal.jsx';
import { AccountSettingsProfileEditModal } from './AccountSettingsProfileEditModal.jsx';
import { CustomerAccountDetailRow } from './CustomerAccountDetailRow.jsx';
import { ProfileVerificationCard } from './ProfileVerificationCard.jsx';
import { ProfileVerificationStatusBadge } from './ProfileVerificationStatusBadge.jsx';
import { ValidIdPanel } from './ValidIdPanel.jsx';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function AccountSettingsSection({
  isMobileViewport,
  theme,
  accountIdentityInitials,
  accountIdentityName,
  accountPanel,
  overviewPhone,
  overviewEmail,
  profileVerification
}) {
  const [changeModal, setChangeModal] = useState('');
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const [profileOverride, setProfileOverride] = useState(null);
  const scrollToValidId = () => document.getElementById('customer-valid-id-panel')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  const idIsVerified = profileVerification?.idVerified === true;
  const displayName = profileOverride?.fullName || accountIdentityName;
  const displayInitials = profileOverride?.initials || accountIdentityInitials;
  const displayPhoto = profileOverride?.photoUrl || '';

  return (
    <div data-testid="customer-account-settings" style={{ display: 'grid', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitleWeight, color: theme.text, margin: 0, lineHeight: 1.15 }}>Account Settings</h2>
        <p style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.pageSubtitle, margin: '6px 0 0' }}>Manage your profile, security and account preferences.</p>
      </div>

      <section style={{ background: theme.surface, borderRadius: 12, border: `1px solid ${theme.border}`, padding: isMobileViewport ? '20px 16px' : 20, display: 'grid', gap: isMobileViewport ? 16 : 14 }}>
        <div style={{ display: 'flex', alignItems: isMobileViewport ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 320px' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div data-testid="customer-account-profile-avatar" style={{ width: isMobileViewport ? 72 : 68, height: isMobileViewport ? 72 : 68, borderRadius: '50%', background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', overflow: 'hidden', fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.heroMetric.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.heroMetric.desktop, fontWeight: 800 }}>{displayPhoto ? <img src={displayPhoto} alt={`${displayName} profile`} style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block' }} /> : displayInitials}</div>
              <div style={{ position: 'absolute', bottom: -1, right: -1, width: 20, height: 20, borderRadius: '50%', background: theme.success, color: '#fff', display: 'grid', placeItems: 'center', border: '2px solid #fff' }}><Check size={12} strokeWidth={4} /></div>
            </div>
            <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <div style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.identityName.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.identityName.desktop, fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{displayName}</div>
                <ProfileVerificationStatusBadge isMobileViewport={isMobileViewport} theme={theme} profileVerification={profileVerification} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', color: theme.muted, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary : CUSTOMER_DASHBOARD_TYPOGRAPHY.body }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, overflowWrap: 'anywhere' }}><Phone size={15} /> {overviewPhone || '+63 *** *** ****'}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, overflowWrap: 'anywhere' }}><Mail size={15} /> {overviewEmail || 'customer@email.com'}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => setIsProfileEditOpen(true)} style={{ background: 'transparent', border: `1px solid ${theme.primary}`, color: theme.primary, borderRadius: 8, minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 18px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', width: isMobileViewport ? '100%' : 'auto' }}><Edit2 size={15} /> Edit Profile</button>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.6fr) minmax(290px, 0.9fr)', gap: 14, alignItems: 'stretch' }}>
        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          <ProfileVerificationCard isMobileViewport={isMobileViewport} theme={theme} profileVerification={profileVerification} />
          <section data-testid="customer-account-details" style={{ background: theme.surface, borderRadius: 12, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 12 : 14, display: 'grid', gap: 10 }}>
            <h3 style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitleWeight, color: theme.text, margin: '0 0 2px' }}>Account Details</h3>
            <CustomerAccountDetailRow isMobileViewport={isMobileViewport} theme={theme} icon={Mail} title="Email Address" value={overviewEmail || 'customer@email.com'} statusLabel={accountPanel?.me?.is_email_verified ? 'Verified ✓' : 'Not verified'} statusTone={accountPanel?.me?.is_email_verified ? 'verified' : 'warning'} actionLabel="Change" onAction={() => setChangeModal('email')} />
            <CustomerAccountDetailRow isMobileViewport={isMobileViewport} theme={theme} icon={Phone} title="Phone Number" value={overviewPhone || '+63 *** *** ****'} statusLabel="Verified ✓" statusTone="verified" actionLabel="Change" onAction={() => setChangeModal('phone')} />
            <CustomerAccountDetailRow isMobileViewport={isMobileViewport} theme={theme} icon={ShieldCheck} title="Valid ID" value={idIsVerified ? 'Government-issued ID verified' : 'Verify your identity with a government-issued ID.'} statusLabel={idIsVerified ? 'Verified ✓' : 'Not verified'} statusTone={idIsVerified ? 'verified' : 'neutral'} actionLabel={idIsVerified ? 'View Details' : 'Upload ID'} onAction={scrollToValidId} />
            <CustomerAccountDetailRow isMobileViewport={isMobileViewport} theme={theme} icon={Lock} title="Password" value={'•'.repeat(8)} actionLabel="Change Password" onAction={() => setChangeModal('password')} />
          </section>
        </div>
        <ValidIdPanel isMobileViewport={isMobileViewport} theme={theme} accountPanel={accountPanel} profileVerification={profileVerification} />
      </div>
      {changeModal && <AccountSettingsChangeModal mode={changeModal} isMobileViewport={isMobileViewport} theme={theme} accountPanel={accountPanel} onClose={() => setChangeModal('')} />}
      {isProfileEditOpen && <AccountSettingsProfileEditModal isMobileViewport={isMobileViewport} theme={theme} profileVerification={profileVerification} initialProfile={{ fullName: displayName, photoUrl: displayPhoto }} onClose={() => setIsProfileEditOpen(false)} onSave={(nextProfile) => { setProfileOverride(nextProfile); setIsProfileEditOpen(false); }} />}
    </div>
  );
}
