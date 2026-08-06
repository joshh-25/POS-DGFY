import React from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Edit2,
  Lock,
  Mail,
  Phone,
  ShieldCheck
} from 'lucide-react';

export function AccountSettingsSection({
  isMobileViewport,
  theme,
  accountIdentityInitials,
  accountIdentityName,
  accountPanel,
  overviewPhone,
  overviewEmail
}) {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: isMobileViewport ? 20 : 28, fontWeight: 800, color: theme.text, marginBottom: 8, lineHeight: 1.15 }}>Account Settings</h2>

      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? '20px 16px' : '24px 32px', display: 'flex', flexDirection: 'column', gap: isMobileViewport ? 18 : 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Profile Overview</h3>
        <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobileViewport ? 16 : 24, flexDirection: isMobileViewport ? 'column' : 'row' }}>
          <div style={{ display: 'flex', alignItems: isMobileViewport ? 'flex-start' : 'center', gap: isMobileViewport ? 16 : 24, flexDirection: isMobileViewport ? 'column' : 'row' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: isMobileViewport ? 84 : 100, height: isMobileViewport ? 84 : 100, borderRadius: '50%', background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', fontSize: isMobileViewport ? 30 : 36, fontWeight: 800 }}>
                {accountIdentityInitials}
              </div>
              <div style={{ position: 'absolute', bottom: 4, right: 4, width: isMobileViewport ? 24 : 28, height: isMobileViewport ? 24 : 28, borderRadius: '50%', background: theme.success, color: '#FFF', display: 'grid', placeItems: 'center', border: '3px solid #FFF' }}>
                <Check size={isMobileViewport ? 14 : 16} strokeWidth={4} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: isMobileViewport ? 16 : 24, fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{accountIdentityName}</div>
                {Boolean(accountPanel?.me?.is_email_verified) && (
                  <div style={{ background: '#E6F4EA', color: '#137333', fontSize: isMobileViewport ? 11 : 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                    <ShieldCheck size={14} /> Verified Customer
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: isMobileViewport ? 10 : 24, marginTop: 4, flexWrap: 'wrap', flexDirection: isMobileViewport ? 'column' : 'row' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme.muted, fontSize: isMobileViewport ? 13 : 14, wordBreak: 'break-word' }}>
                  <Phone size={16} /> {overviewPhone || '+63 *** *** ****'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme.muted, fontSize: isMobileViewport ? 13 : 14, wordBreak: 'break-word' }}>
                  <Mail size={16} /> {overviewEmail || 'customer@email.com'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={() => alert('Editing profile is coming soon.')} style={{ background: 'transparent', border: `1px solid ${theme.primary}`, color: theme.primary, borderRadius: 8, padding: isMobileViewport ? '10px 14px' : '10px 20px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', width: isMobileViewport ? '100%' : 'auto' }}>
            <Edit2 size={16} /> Edit Profile
          </button>
        </div>
      </div>

      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? '20px 16px' : '24px 32px', display: 'flex', flexDirection: 'column', gap: isMobileViewport ? 18 : 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Contact Information</h3>
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', padding: isMobileViewport ? '14px 16px' : '16px 20px', background: theme.surface, borderRadius: 12, border: `1px solid ${theme.border}`, flexDirection: isMobileViewport ? 'column' : 'row', gap: isMobileViewport ? 14 : 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center' }}>
                <Mail size={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: theme.text, fontWeight: 700, marginBottom: 4 }}>Email Address</div>
                <div style={{ fontSize: isMobileViewport ? 14 : 15, fontWeight: 600, color: theme.text, overflowWrap: 'anywhere' }}>{overviewEmail || 'customer@email.com'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', gap: isMobileViewport ? 10 : 24, flexDirection: isMobileViewport ? 'column' : 'row', width: isMobileViewport ? '100%' : 'auto' }}>
              {accountPanel?.me?.is_email_verified ? (
                <span style={{ background: '#E6F4EA', color: '#137333', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Verified <CheckCircle2 size={14} />
                </span>
              ) : (
                <span style={{ background: '#FFF3E0', color: '#E65100', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Unverified
                </span>
              )}
              <button onClick={() => alert('Change email flow initiated.')} style={{ background: 'transparent', border: 'none', color: theme.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, justifyContent: isMobileViewport ? 'space-between' : 'flex-start' }}>
                Change <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', padding: isMobileViewport ? '14px 16px' : '16px 20px', background: theme.surface, borderRadius: 12, border: `1px solid ${theme.border}`, flexDirection: isMobileViewport ? 'column' : 'row', gap: isMobileViewport ? 14 : 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center' }}>
                <Phone size={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: theme.text, fontWeight: 700, marginBottom: 4 }}>Phone Number</div>
                <div style={{ fontSize: isMobileViewport ? 14 : 15, fontWeight: 600, color: theme.text, overflowWrap: 'anywhere' }}>{overviewPhone || '+63 *** *** ****'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', gap: isMobileViewport ? 10 : 24, flexDirection: isMobileViewport ? 'column' : 'row', width: isMobileViewport ? '100%' : 'auto' }}>
              <span style={{ background: '#E6F4EA', color: '#137333', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                Verified <CheckCircle2 size={14} />
              </span>
              <button onClick={() => alert('Change phone flow initiated.')} style={{ background: 'transparent', border: 'none', color: theme.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, justifyContent: isMobileViewport ? 'space-between' : 'flex-start' }}>
                Change <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? '20px 16px' : '24px 32px', display: 'flex', flexDirection: 'column', gap: isMobileViewport ? 18 : 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Security</h3>
        <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', padding: '0px 0px 8px 0px', flexDirection: isMobileViewport ? 'column' : 'row', gap: isMobileViewport ? 14 : 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center' }}>
              <Lock size={24} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: theme.text, fontWeight: 700 }}>Password</div>
              <div style={{ fontSize: isMobileViewport ? 22 : 24, fontWeight: 700, color: theme.text, marginTop: 4, letterSpacing: 2, lineHeight: 1 }}>{'\u2022'.repeat(8)}</div>
            </div>
          </div>
          <button onClick={() => alert('Change password flow initiated.')} style={{ background: 'transparent', border: 'none', color: theme.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, justifyContent: isMobileViewport ? 'space-between' : 'flex-start' }}>
            Change Password <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
