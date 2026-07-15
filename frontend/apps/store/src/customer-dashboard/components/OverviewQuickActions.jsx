import React from 'react';
import { HeadphonesIcon, HelpCircle, MapPin, ShoppingBag, User } from 'lucide-react';

export function OverviewQuickActions({ isMobileViewport, theme, setActiveNav, onHelp }) {
  return <>
  {!isMobileViewport ? (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: theme.text, marginBottom: 16 }}>Quick Actions</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 16 }}>
        {[
          { label: 'Reorder Items', icon: ShoppingBag, color: theme.success },
          { label: 'Add Address', icon: MapPin, color: theme.orange },
          { label: 'Update Profile', icon: User, color: theme.primary },
          { label: 'Help Center', icon: HelpCircle, color: theme.purple },
          { label: 'Contact Support', icon: HeadphonesIcon, color: theme.info }
        ].map((action, index) => {
          const Icon = action.icon;
          return (
            <button key={index} onClick={action.label === 'Reorder Items' ? () => setActiveNav('orders') : action.label === 'Add Address' ? () => setActiveNav('addresses') : action.label === 'Update Profile' ? () => setActiveNav('account') : onHelp} style={{ background: theme.surface, borderRadius: 12, border: `1px solid ${theme.border}`, padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer', transition: 'background 200ms' }} onMouseOver={(e) => { e.currentTarget.style.background = theme.bg; }} onMouseOut={(e) => { e.currentTarget.style.background = theme.surface; }}>
              <Icon size={18} color={action.color} />
              <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  ) : null}
  </>;
}
