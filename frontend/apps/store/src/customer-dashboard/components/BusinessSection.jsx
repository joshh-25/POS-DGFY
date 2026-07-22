import React from 'react';
import { Calculator, Crown, MoreVertical, Store } from 'lucide-react';

export function BusinessSection({
  isMobileViewport,
  theme,
  businessCompanies,
  businessMemberships,
  businessActionError,
  businessActionLoading,
  businessStepUpAction,
  businessEmailOtpCode,
  setBusinessEmailOtpCode,
  setBusinessStepUpAction,
  startBusinessAction,
  submitBusinessStepUpAction,
  onRegisterBusiness,
  onOpenBusinessPos,
  resolveBusinessAssetUrl,
  getBusinessCoverUrl,
  getBusinessProfileUrl,
  getBusinessRoleLabel,
  getBusinessStatusLabel
}) {
  const normalizedCompanies = businessCompanies.length > 0
    ? businessCompanies
    : businessMemberships.map((membership) => ({ ...membership.company, ...membership, company_name: membership.company?.name }));
  const pending = normalizedCompanies.filter((company) => company.requires_action === 'accept_invitation' || company.status === 'pending');
  const accepted = normalizedCompanies.filter((company) => !pending.includes(company));

  return (
    <div style={{ display: 'grid', gap: isMobileViewport ? 16 : 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 14, background: 'linear-gradient(135deg,#FFF4CC 0%,#FCD34D 100%)', color: '#7C5600', display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(245,158,11,0.18)' }}>
            <Crown size={18} />
          </span>
          <div>
            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 20 : 24 }}>Your businesses</h2>
            <p style={{ margin: '6px 0 0', color: theme.muted }}>Premium access to the companies and tools connected to this DGFY account.</p>
          </div>
        </div>
        <button type="button" onClick={onRegisterBusiness} style={{ border: 0, borderRadius: 10, background: theme.primary, color: '#fff', minHeight: 42, padding: '0 16px', fontWeight: 700, cursor: 'pointer' }}>Register New Company</button>
      </div>
      {businessActionError ? <div role="alert" style={{ borderRadius: 10, background: '#FEF2F2', color: '#991B1B', padding: 12 }}>{businessActionError}</div> : null}
      {pending.length > 0 ? <section style={{ display: 'grid', gap: 10 }}><strong>Pending invitations</strong>{pending.map((company) => <div key={`invite-${company.membership_id}`} style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.infoBg, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong>{company.company_name || company.name || 'Company invitation'}</strong><div style={{ marginTop: 4, color: theme.muted, fontSize: 13 }}>Invitation from IMS</div></div><div style={{ display: 'flex', gap: 8 }}><button type="button" disabled={businessActionLoading} onClick={() => startBusinessAction('reject', company)}>Reject</button><button type="button" disabled={businessActionLoading} onClick={() => startBusinessAction('accept', company)}>Accept</button></div></div>)}</section> : null}
      {businessStepUpAction ? <section style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}><strong>Email security check</strong><span style={{ color: theme.muted, fontSize: 13 }}>Enter the 6-digit code sent to your DGFY email.</span><input inputMode="numeric" value={businessEmailOtpCode} onChange={(event) => setBusinessEmailOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} aria-label="Business security code" /><div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => setBusinessStepUpAction(null)}>Cancel</button><button type="button" disabled={businessActionLoading} onClick={submitBusinessStepUpAction}>Verify and continue</button></div></section> : null}
      {accepted.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
          {accepted.map((company) => {
            const name = company.company_name || company.name || 'Business';
            const owned = company.is_owner === true || company.membership_type === 'owner' || company.role === 'owner' || company.role === 'business_owner';
            const coverUrl = getBusinessCoverUrl(company, resolveBusinessAssetUrl);
            const profileUrl = getBusinessProfileUrl(company, resolveBusinessAssetUrl);
            const roleLabel = getBusinessRoleLabel(company);
            const statusLabel = getBusinessStatusLabel(company);

            return (
              <article key={`company-${company.membership_id || company.tenant_id}`} style={{ border: `1px solid ${theme.border}`, borderRadius: 20, overflow: 'hidden', background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.04)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', height: 160, background: coverUrl ? '#E5EEF8' : 'linear-gradient(135deg,#103E73 0%,#2563EB 50%,#AEE8F4 100%)' }}>
                  {coverUrl ? <img src={coverUrl} alt={`${name} cover`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.0) 0%, rgba(15,23,42,0.2) 100%)' }} />
                  <div style={{ position: 'absolute', top: 14, right: 14 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 999, background: '#fff', color: theme.text, padding: '4px 10px', fontSize: 12, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.success }} />
                      {statusLabel}
                    </span>
                  </div>
                </div>

                <div style={{ position: 'relative', padding: '0 20px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', border: '4px solid #fff', background: '#fff', display: 'grid', placeItems: 'center', marginTop: -36, position: 'relative', zIndex: 2, overflow: 'hidden', flexShrink: 0, boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                      {profileUrl ? <img src={profileUrl} alt={`${name} profile`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: theme.infoBg, display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 900, color: theme.primary }}>{name.charAt(0).toUpperCase()}</div>}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <button type="button" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: theme.muted, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Business options">
                        <MoreVertical size={20} />
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</h3>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: theme.muted }}>{owned ? 'Company you own' : 'Company membership'}</p>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: theme.infoBg, color: theme.primary, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                      <Store size={14} />
                      {roleLabel}
                    </span>
                  </div>

                  <div style={{ flex: 1, minHeight: 24 }} />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 'auto' }}>
                    <button type="button" disabled={businessActionLoading} onClick={() => onOpenBusinessPos?.(company)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 10, border: 'none', background: theme.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: businessActionLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(26,78,141,0.2)', padding: '0 8px' }}>
                      <Calculator size={16} />
                      Go to POS
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', background: '#fff', borderRadius: 24, border: `1px solid ${theme.border}`, textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', marginBottom: 24, boxShadow: '0 12px 32px rgba(37,99,235,0.12)' }}>
            <Store size={36} strokeWidth={2.5} />
          </div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: theme.text }}>Manage all your businesses in one place</h3>
          <p style={{ margin: '12px 0 24px', color: theme.muted, fontSize: 15, maxWidth: 400, lineHeight: 1.5 }}>Access your tools and grow your business with DGFY.</p>
          <button type="button" onClick={onRegisterBusiness} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 0, borderRadius: 12, background: theme.primary, color: '#fff', minHeight: 48, padding: '0 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px rgba(26,78,141,0.24)' }}>
            <Store size={18} />
            Register New Company
          </button>
        </div>
      )}
    </div>
  );
}
