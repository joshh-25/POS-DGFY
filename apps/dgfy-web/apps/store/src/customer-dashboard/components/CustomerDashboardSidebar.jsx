import React from 'react';
import { HeadphonesIcon, HelpCircle, LogOut, X } from 'lucide-react';
import { CUSTOMER_DASHBOARD_NAV_ITEMS, CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const DGFY_CUSTOMER_LOGO_URL = '/dgfy-logo.png';

export function CustomerDashboardSidebar({ activeNav, onSelectNav, onHelp, onSignOut, isMobileViewport, onCloseMobile, style, theme }) {
  return (
    <aside style={style}>
      <div style={{ height: 72, padding: '0 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
        <img src={DGFY_CUSTOMER_LOGO_URL} alt="DGFY Logo" style={{ height: 28 }} />
        <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro, fontWeight: 600, color: theme.primary, letterSpacing: '0.02em', marginTop: 2 }}>Discover Goods For You</div>
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
