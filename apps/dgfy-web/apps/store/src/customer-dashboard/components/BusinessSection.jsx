import React, { useState } from 'react';
import { Calculator, KeyRound, MoreVertical, Plus, Store } from 'lucide-react';
import {
  CUSTOMER_BUSINESS_INDUSTRY_TABS,
  getCustomerBusinessIndustry
} from '../model/customerBusinessAssets.js';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

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
  onOpenBusinessDayClose,
  resolveBusinessAssetUrl,
  getBusinessCoverUrl,
  getBusinessProfileUrl,
  getBusinessRoleLabel,
  getBusinessStatusLabel
}) {
  const normalizedCompanies = businessCompanies.length > 0
    ? businessCompanies
    : businessMemberships.map((membership) => ({ ...membership.company, ...membership, company_name: membership.company?.name }));
  const pending = normalizedCompanies.filter((company) => company.requires_action === 'accept_invitation');
  const accepted = normalizedCompanies.filter((company) => !pending.includes(company));
  const hasExistingBusiness = accepted.length > 0;
  const availableIndustryIds = new Set(accepted.map(getCustomerBusinessIndustry).filter(Boolean));
  const visibleIndustryTabs = [
    { id: 'all', label: 'All' },
    ...CUSTOMER_BUSINESS_INDUSTRY_TABS.filter((tab) => availableIndustryIds.has(tab.id))
  ];
  const visibleIndustryKey = visibleIndustryTabs.map((tab) => tab.id).join('|');
  const [activeIndustry, setActiveIndustry] = useState('all');
  const resolvedActiveIndustry = visibleIndustryKey.split('|').includes(activeIndustry) ? activeIndustry : 'all';
  const visibleAccepted = resolvedActiveIndustry === 'all'
    ? accepted
    : accepted.filter((company) => getCustomerBusinessIndustry(company) === resolvedActiveIndustry);

  const isBusinessActive = (company, statusLabel) => {
    const statusValues = [
      company?.tenant_status,
      company?.business_status,
      company?.status,
      statusLabel
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    const hasInactiveStatus = statusValues.some((value) => ['inactive', 'disabled', 'suspended', 'revoked', 'deactivated'].some((token) => value.includes(token)));
    return !hasInactiveStatus && statusValues.some((value) => value === 'active' || value.includes('active'));
  };

  return (
    <div style={{ display: 'grid', gap: isMobileViewport ? 16 : 22 }}>
      <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitleWeight, color: theme.text }}>Your businesses</h2>
          <p style={{ margin: '6px 0 0', color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.pageSubtitle }}>Manage the businesses and tools connected to this DGFY account.</p>
        </div>
        {hasExistingBusiness ? <div data-testid="customer-business-add-action" style={{ display: 'flex', justifyContent: isMobileViewport ? 'flex-end' : 'initial', width: isMobileViewport ? '100%' : 'auto' }}><button type="button" onClick={onRegisterBusiness} style={{ border: 0, borderRadius: 10, background: theme.primary, color: '#fff', minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 16px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0 }}> <Plus size={16} strokeWidth={2.5} /> Add Business</button></div> : null}
      </div>
      {businessActionError ? <div role="alert" style={{ borderRadius: 10, background: '#FEF2F2', color: '#991B1B', padding: 12, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body }}>{businessActionError}</div> : null}
      {pending.length > 0 ? <section style={{ display: 'grid', gap: 10 }}><strong style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle }}>Pending invitations</strong>{pending.map((company) => <div key={`invite-${company.membership_id}`} style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.infoBg, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle }}>{company.company_name || company.name || 'Company invitation'}</strong><div style={{ marginTop: 4, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary }}>Invitation from IMS</div></div><div style={{ display: 'flex', gap: 8 }}><button type="button" disabled={businessActionLoading} onClick={() => startBusinessAction('reject', company)} style={{ minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 14px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction }}>Reject</button><button type="button" disabled={businessActionLoading} onClick={() => startBusinessAction('accept', company)} style={{ minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 14px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction }}>Accept</button></div></div>)}</section> : null}
      {businessStepUpAction ? <section style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}><strong style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle }}>Email security check</strong><span style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary }}>Enter the 6-digit code sent to your DGFY email.</span><input inputMode="numeric" value={businessEmailOtpCode} onChange={(event) => setBusinessEmailOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} aria-label="Business security code" style={{ minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, boxSizing: 'border-box', padding: '0 12px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body }} /><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" onClick={() => setBusinessStepUpAction(null)} style={{ minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 14px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction }}>Cancel</button><button type="button" disabled={businessActionLoading} onClick={submitBusinessStepUpAction} style={{ minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 14px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction }}>Verify and continue</button></div></section> : null}
      {hasExistingBusiness ? (
        <div data-testid="customer-business-industry-tabs" style={{ display: 'flex', flexWrap: 'nowrap', gap: isMobileViewport ? 8 : 10, padding: isMobileViewport ? '0 0 4px' : 0, borderBottom: `1px solid ${theme.border}`, overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarWidth: 'thin' }}>
          {visibleIndustryTabs.map((tab) => {
            const selected = resolvedActiveIndustry === tab.id;
            const tabCount = tab.id === 'all'
              ? accepted.length
              : accepted.filter((company) => getCustomerBusinessIndustry(company) === tab.id).length;
            return <button key={tab.id} type="button" aria-label={`${tab.label} ${tabCount}`} onClick={() => setActiveIndustry(tab.id)} style={{ minHeight: isMobileViewport ? 44 : 40, flexShrink: 0, background: 'transparent', border: 'none', borderBottom: selected ? `2px solid ${theme.primary}` : '2px solid transparent', color: selected ? theme.primary : theme.muted, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.tab.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.tab.desktop, fontWeight: selected ? 600 : 500, padding: isMobileViewport ? '0 12px' : '0 16px', borderRadius: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap' }}><span>{tab.label}</span><span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 700, background: selected ? '#fff' : theme.bg, color: selected ? theme.primary : theme.muted, padding: '2px 6px', borderRadius: 999 }}>{tabCount}</span></button>;
          })}
        </div>
      ) : null}
      {hasExistingBusiness ? (
        <div data-testid="customer-business-card-grid" style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: isMobileViewport ? 12 : 18 }}>
          {visibleAccepted.map((company) => {
            const name = company.company_name || company.name || 'Business';
            const owned = company.is_owner === true
              || company.membership_type === 'owner'
              || company.role === 'owner'
              || company.role === 'business_owner';
            const coverUrl = getBusinessCoverUrl(company, resolveBusinessAssetUrl);
            const profileUrl = getBusinessProfileUrl(company, resolveBusinessAssetUrl);
            const roleLabel = getBusinessRoleLabel(company);
            const mobileRoleLabel = owned ? 'Owner' : roleLabel;
            const statusLabel = getBusinessStatusLabel(company);
            const isActive = isBusinessActive(company, statusLabel);
            const companyKey = company.membership_id || company.tenant_id || name;

            return (
              isMobileViewport ? (
                <article key={`company-${companyKey}`} data-testid="customer-business-card-mobile" style={{ border: `1px solid ${theme.border}`, borderRadius: 16, background: '#fff', boxShadow: '0 6px 18px rgba(15,23,42,0.04)', padding: 14, minWidth: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: '3px solid #fff', background: profileUrl ? '#F8FAFC' : theme.infoBg, display: 'grid', placeItems: 'center', overflow: 'hidden', boxShadow: '0 3px 10px rgba(15,23,42,0.08)', position: 'relative' }}>
                        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: theme.infoBg, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.heroMetric.mobile, fontWeight: 800, color: theme.primary }}>{name.charAt(0).toUpperCase()}</span>
                        {profileUrl ? <img src={profileUrl} alt={`${name} profile`} onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} /> : null}
                      </div>
                      <span data-testid={`customer-business-status-dot-${companyKey}`} role="img" aria-label={`${name} ${isActive ? 'active' : 'inactive'}`} title={isActive ? 'Active' : 'Inactive'} style={{ position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: '50%', background: isActive ? theme.success : '#98A2B3', border: '2px solid #fff', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                        <h3 style={{ margin: 0, minWidth: 0, flex: '1 1 96px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.2, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitleWeight, color: theme.text }}>{name}</h3>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, alignSelf: 'flex-start', background: theme.infoBg, color: theme.primary, padding: '3px 6px', borderRadius: 999, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, fontWeight: 700, lineHeight: 1.1, whiteSpace: 'nowrap' }}><Store size={11} />{mobileRoleLabel}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: 500, color: theme.muted }}>{owned ? 'Company you own' : 'Company membership'}</p>
                    </div>
                    <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                      <button type="button" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: theme.muted, padding: 0, minWidth: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, minHeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label={`Business options for ${name}`}>
                        <MoreVertical size={20} />
                      </button>
                      <button type="button" aria-label={`Go to POS for ${name}`} disabled={businessActionLoading} onClick={() => onOpenBusinessPos?.(company)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 9, border: `1px solid ${theme.primary}`, background: '#fff', color: theme.primary, fontWeight: 700, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, cursor: businessActionLoading ? 'not-allowed' : 'pointer', padding: '0 10px', whiteSpace: 'nowrap' }}>
                        <Calculator size={15} />
                        Go to POS
                      </button>
                    </div>
                  </div>
                </article>
              ) : (
                <article key={`company-${companyKey}`} data-testid="customer-business-card-desktop" style={{ border: `1px solid ${theme.border}`, borderRadius: 20, overflow: 'hidden', background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.04)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ position: 'relative', height: 160, background: coverUrl ? '#E5EEF8' : 'linear-gradient(135deg,#103E73 0%,#2563EB 50%,#AEE8F4 100%)' }}>
                    {coverUrl ? <img src={coverUrl} alt={`${name} cover`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.0) 0%, rgba(15,23,42,0.2) 100%)' }} />
                    <div style={{ position: 'absolute', top: 14, right: 14 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 999, background: '#fff', color: theme.text, padding: '4px 10px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? theme.success : '#98A2B3' }} />
                        {statusLabel}
                      </span>
                    </div>
                  </div>

                  <div style={{ position: 'relative', padding: '0 20px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ width: 72, height: 72, borderRadius: '50%', border: '4px solid #fff', background: '#fff', display: 'grid', placeItems: 'center', marginTop: -36, position: 'relative', zIndex: 2, overflow: 'hidden', flexShrink: 0, boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                        {profileUrl ? <img src={profileUrl} alt={`${name} profile`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: theme.infoBg, display: 'grid', placeItems: 'center', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.heroMetric.mobile, fontWeight: 900, color: theme.primary }}>{name.charAt(0).toUpperCase()}</div>}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button type="button" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: theme.muted, padding: 0, minWidth: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.desktop, minHeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.desktop, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label={`Business options for ${name}`}>
                          <MoreVertical size={20} />
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <h3 style={{ margin: 0, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitleWeight, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</h3>
                      <p style={{ margin: 0, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: 500, color: theme.muted }}>{owned ? 'Company you own' : 'Company membership'}</p>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: theme.infoBg, color: theme.primary, padding: '6px 12px', borderRadius: 999, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 700 }}>
                        <Store size={14} />
                        {roleLabel}
                      </span>
                    </div>

                    <div style={{ flex: 1, minHeight: 24 }} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 'auto' }}>
                      <button type="button" disabled={businessActionLoading} onClick={() => onOpenBusinessDayClose?.(company)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 40, borderRadius: 10, border: `1px solid ${theme.primary}`, background: '#fff', color: theme.primary, fontWeight: 700, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, cursor: businessActionLoading ? 'not-allowed' : 'pointer', padding: '0 8px' }}>
                        <KeyRound size={16} />
                        Day Close
                      </button>
                      <button type="button" disabled={businessActionLoading} onClick={() => onOpenBusinessPos?.(company)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 10, border: 'none', background: theme.primary, color: '#fff', fontWeight: 700, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, cursor: businessActionLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(26,78,141,0.2)', padding: '0 8px' }}>
                        <Calculator size={16} />
                        Go to POS
                      </button>
                    </div>
                  </div>
                </article>
              )
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', background: '#fff', borderRadius: 24, border: `1px solid ${theme.border}`, textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', marginBottom: 24, boxShadow: '0 12px 32px rgba(37,99,235,0.12)' }}>
            <Store size={36} strokeWidth={2.5} />
          </div>
          <h3 style={{ margin: 0, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitleWeight, color: theme.text }}>Grow your business</h3>
          <p style={{ margin: '12px 0 24px', color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, maxWidth: 400, lineHeight: 1.5 }}>Complete your store profile to attract more customers.</p>
          <button type="button" onClick={onRegisterBusiness} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 0, borderRadius: 12, background: theme.primary, color: '#fff', minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 20px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px rgba(26,78,141,0.24)' }}>
            <Store size={18} />
            Register Your Business
          </button>
        </div>
      )}
    </div>
  );
}
