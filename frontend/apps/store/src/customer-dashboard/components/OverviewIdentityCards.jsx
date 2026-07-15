import React from 'react';
import { ChevronRight, Mail, Phone, ShieldCheck, Store } from 'lucide-react';

export function OverviewIdentityCards({ isMobileViewport, theme, accountIdentityInitials, accountIdentityName, accountPanel, overviewPhone, overviewEmail, setActiveNav, onRegisterBusiness }) {
  return (
  <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1.5fr 1fr', gap: isMobileViewport ? 14 : 24 }}>
    <div style={{ background: theme.surface, borderRadius: isMobileViewport ? 20 : 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 16 : 24, display: 'flex', alignItems: isMobileViewport ? 'flex-start' : 'center', justifyContent: 'space-between', gap: isMobileViewport ? 12 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 14 : 20, minWidth: 0, flex: 1 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: isMobileViewport ? 64 : 80, height: isMobileViewport ? 64 : 80, borderRadius: '50%', background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', fontSize: isMobileViewport ? 24 : 28, fontWeight: 800 }}>
            {accountIdentityInitials}
          </div>
          {Boolean(accountPanel?.me?.is_email_verified) && (
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: isMobileViewport ? 20 : 24, height: isMobileViewport ? 20 : 24, borderRadius: '50%', background: theme.success, color: '#FFF', display: 'grid', placeItems: 'center', border: '2px solid #FFF' }}>
              <ShieldCheck size={14} strokeWidth={3} />
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: isMobileViewport ? 16 : 24, fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{accountIdentityName}</div>
            {Boolean(accountPanel?.me?.is_email_verified) && (
              <span style={{ background: theme.primary, color: '#FFF', fontSize: isMobileViewport ? 9 : 10, fontWeight: 700, padding: isMobileViewport ? '2px 5px' : '2px 6px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ShieldCheck size={10} /> Verified
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gap: isMobileViewport ? 6 : 8, color: theme.muted, fontSize: isMobileViewport ? 13 : 14 }}>
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
      <button onClick={() => setActiveNav('account')} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.primary, borderRadius: 12, padding: isMobileViewport ? 0 : '8px 16px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', flexShrink: 0, width: isMobileViewport ? 48 : 'auto', height: isMobileViewport ? 48 : 'auto' }}>
        {!isMobileViewport ? 'Edit Profile' : null}
      </button>
    </div>

    <div style={{ background: theme.surface, borderRadius: isMobileViewport ? 20 : 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 16 : 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'box-shadow 200ms', gap: isMobileViewport ? 14 : 20 }} onMouseOver={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; }} onMouseOut={(e) => { e.currentTarget.style.boxShadow = 'none'; }} onClick={onRegisterBusiness}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 14 : 20 }}>
        <div style={{ width: isMobileViewport ? 48 : 64, height: isMobileViewport ? 48 : 64, borderRadius: isMobileViewport ? 14 : 16, background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Store size={isMobileViewport ? 24 : 32} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 700, color: theme.text, marginBottom: 4 }}>Grow your business</div>
          <div style={{ fontSize: isMobileViewport ? 13 : 14, color: theme.muted, lineHeight: 1.4 }}>Complete your store profile to attract more customers.</div>
        </div>
      </div>
      <ChevronRight size={isMobileViewport ? 20 : 24} color={theme.text} style={{ flexShrink: 0, alignSelf: 'center' }} />
    </div>
  </div>
  );
}

