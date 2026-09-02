import React from 'react';
import { HeadphonesIcon, HelpCircle, LogOut, X } from 'lucide-react';
import { CUSTOMER_DASHBOARD_NAV_ITEMS, CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function CustomerDashboardSidebar({ activeNav, onSelectNav, onHelp, onSignOut, isMobileViewport, onCloseMobile, accountIdentityInitials, accountIdentityName, style, theme }) {
  const profileName = accountIdentityName || 'Customer';
  const profileInitials = accountIdentityInitials || 'CU';
  return (
    <aside style={style}>
      <div style={{ minHeight: 72, padding: '0 16px 0 24px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, flexShrink: 0, position: 'relative', boxSizing: 'border-box' }}>
        <button
          type="button"
          onClick={() => onSelectNav('account')}
          aria-label="Open My Account"
          style={{ width: '100%', minWidth: 0, minHeight: 44, display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', alignItems: 'center', gap: 10, padding: isMobileViewport ? '0 34px 0 0' : 0, border: 'none', background: 'transparent', color: theme.text, textAlign: 'left', cursor: 'pointer' }}
        >
          <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, fontWeight: 700, flexShrink: 0 }}>{profileInitials}</span>
          <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
            <span title={profileName} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, fontWeight: 700, color: theme.text }}>{profileName}</span>
            <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, color: theme.muted }}>My Account</span>
          </span>
        </button>
        {isMobileViewport ? <button type="button" aria-label="Close menu" onClick={onCloseMobile} style={{ position: 'absolute', top: 16, right: 16, minWidth: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, minHeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, display: 'grid', placeItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}><X size={24} color={theme.muted} /></button> : null}
      </div>
      <nav style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {CUSTOMER_DASHBOARD_NAV_ITEMS.filter((item) => item.visible !== false).map((item) => {
          const Icon = item.icon;
          const selected = activeNav === item.id;
          return <button key={item.id} type="button" onClick={() => onSelectNav(item.id)} style={{ background: selected ? theme.infoBg : 'transparent', border: 'none', borderLeft: selected ? `4px solid ${theme.primary}` : '4px solid transparent', borderRadius: '0 8px 8px 0', color: selected ? theme.primary : theme.muted, minHeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, fontWeight: selected ? 700 : 500, cursor: 'pointer' }}><Icon size={20} />{item.label}</button>;
        })}
        <div style={{ height: 1, background: theme.border, margin: '16px 0' }} />
        <button type="button" onClick={onHelp} style={{ background: 'transparent', border: 'none', color: theme.muted, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, cursor: 'pointer' }}><HelpCircle size={20} /> Help Center</button>
        <button type="button" onClick={onHelp} style={{ background: 'transparent', border: 'none', color: theme.muted, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, cursor: 'pointer' }}><HeadphonesIcon size={20} /> Contact Support</button>
      </nav>
      <div style={{ padding: 24, marginTop: 'auto' }}><button type="button" onClick={onSignOut} style={{ background: 'transparent', border: 'none', color: theme.orange, display: 'flex', alignItems: 'center', gap: 12, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, fontWeight: 600, cursor: 'pointer' }}><LogOut size={20} /> Sign out</button></div>
    </aside>
  );
}
