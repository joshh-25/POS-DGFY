import React from 'react';
import { Crown, HeadphonesIcon, HelpCircle, LogOut, X } from 'lucide-react';
import dgfyCustomerLogo from '../../../../../public/dgfy-logo.png';
import { CUSTOMER_DASHBOARD_NAV_ITEMS } from '../model/customerDashboardPresentation.jsx';

export function CustomerDashboardSidebar({ activeNav, onSelectNav, onHelp, onSignOut, isMobileViewport, onCloseMobile, style, theme }) {
  return (
    <aside style={style}>
      <div style={{ height: 72, padding: '0 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
        <img src={dgfyCustomerLogo} alt="DGFY Logo" style={{ height: 28 }} />
        <div style={{ fontSize: 10, fontWeight: 600, color: theme.primary, letterSpacing: '0.02em', marginTop: 2 }}>Discover Goods For You</div>
        {isMobileViewport ? <button type="button" aria-label="Close menu" onClick={onCloseMobile} style={{ position: 'absolute', top: 24, right: 24, background: 'none', border: 'none' }}><X size={24} color={theme.muted} /></button> : null}
      </div>
      <nav style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {CUSTOMER_DASHBOARD_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const selected = activeNav === item.id;
          return <button key={item.id} type="button" onClick={() => onSelectNav(item.id)} style={{ background: selected ? theme.infoBg : 'transparent', border: 'none', borderLeft: selected ? `4px solid ${theme.primary}` : '4px solid transparent', borderRadius: '0 8px 8px 0', color: selected ? theme.primary : theme.muted, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 15, fontWeight: selected ? 700 : 500, cursor: 'pointer' }}><Icon size={20} /><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span>{item.label}</span>{item.premium ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, padding: '4px 8px', background: selected ? 'rgba(255,255,255,0.88)' : '#FFF8E1', color: '#8A5A00', fontSize: 11, fontWeight: 800 }}><Crown size={12} />Premium</span> : null}</span></button>;
        })}
        <div style={{ height: 1, background: theme.border, margin: '16px 0' }} />
        <button type="button" onClick={onHelp} style={{ background: 'transparent', border: 'none', color: theme.muted, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 15, cursor: 'pointer' }}><HelpCircle size={20} /> Help Center</button>
        <button type="button" onClick={onHelp} style={{ background: 'transparent', border: 'none', color: theme.muted, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 15, cursor: 'pointer' }}><HeadphonesIcon size={20} /> Contact Support</button>
      </nav>
      <div style={{ padding: 24, marginTop: 'auto' }}><button type="button" onClick={onSignOut} style={{ background: 'transparent', border: 'none', color: theme.orange, display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}><LogOut size={20} /> Sign out</button></div>
    </aside>
  );
}
