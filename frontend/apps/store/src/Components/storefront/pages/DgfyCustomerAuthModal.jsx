import React from 'react';
import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  User,
  X
} from 'lucide-react';

const PRIMARY = '#1A4E8D';
const PRIMARY_DARK = '#1A4586';
const PRIMARY_TINT = '#AEE8F4';
const TEXT = '#101828';
const MUTED = '#667085';
const BORDER = '#E2EAFF';
const SURFACE = '#FFFFFF';
const LEFT_BG = '#F4F8FF';
const DANGER = '#D92D20';

const toMaskedContact = (saved = null) => {
  if (!saved) return '';
  const phone = String(saved.phone || '').trim();
  const email = String(saved.email || '').trim();
  if (phone) {
    if (phone.length <= 6) return phone;
    return phone.slice(0, 3) + '*'.repeat(Math.max(0, phone.length - 5)) + phone.slice(-2);
  }
  if (email) {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    return local.slice(0, 2) + '***@' + domain;
  }
  return '';
};

const toInitials = (name = '') => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || 'GU';
};

const formatSavedAge = (updatedAt) => {
  const ts = Number(updatedAt);
  if (!Number.isFinite(ts) || ts <= 0) return 'Last saved recently';
  const days = Math.floor(Math.max(0, Date.now() - ts) / 86400000);
  if (days <= 0) return 'Last saved today';
  if (days === 1) return 'Last saved 1 day ago';
  return `Last saved ${days} days ago`;
};

function PrimaryButton({ children, onClick, disabled, style = {} }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        height: 44,
        borderRadius: 10,
        border: 'none',
        background: disabled ? '#7BA7D6' : `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%)`,
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: '0.01em',
        cursor: disabled ? 'wait' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        boxShadow: disabled ? 'none' : '0 4px 16px rgba(26,78,141,0.28)',
        transition: 'opacity 150ms ease, box-shadow 150ms ease',
        ...style
      }}
    >
      {children}
    </button>
  );
}

export function DgfyCustomerAuthModal({
  isMobileViewport,
  onClose,
  savedCustomerDetails,
  hasSavedCustomerDetails,
  onContinueAsGuest,
  onClearSavedDetails,
  onOpenAuth,
  onOpenRegisterBusiness
}) {
  const savedName = String(savedCustomerDetails?.name || '').trim() || 'Saved customer';
  const savedContact = toMaskedContact(savedCustomerDetails);
  const savedInitials = toInitials(savedName);
  const savedAgeLabel = formatSavedAge(savedCustomerDetails?.updatedAt);
  const benefits = [
    { icon: ShoppingBag, title: 'Orders', body: 'Track your orders across all DGFY stores.' },
    { icon: CalendarCheck2, title: 'Bookings', body: 'View your bookings and service activity.' },
    { icon: ShieldCheck, title: 'Saved Details', body: 'Securely save your details for faster checkout.' }
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Close DGFY account modal"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 2498, border: 'none', background: 'rgba(8,16,42,0.68)', backdropFilter: 'blur(12px)', cursor: 'pointer' }}
      />
      <div role="dialog" aria-modal="true" aria-label="DGFY Account" style={{ position: 'fixed', inset: 0, zIndex: 2499, display: 'flex', alignItems: isMobileViewport ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobileViewport ? 0 : '20px 16px' }}>
        <section style={{ width: isMobileViewport ? '100vw' : 'min(1020px, calc(100vw - 24px))', maxHeight: isMobileViewport ? '96vh' : 'min(92vh, 860px)', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: isMobileViewport ? '20px 20px 0 0' : 20, boxShadow: '0 24px 80px rgba(8,16,42,0.22)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <header style={{ padding: isMobileViewport ? '16px 18px 14px' : '20px 26px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexShrink: 0, background: SURFACE }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: `linear-gradient(140deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%)`, color: '#FFFFFF', display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 6px 18px rgba(26,78,141,0.28)' }}>
                <User size={22} strokeWidth={2.2} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: isMobileViewport ? 17 : 19, fontWeight: 800, color: TEXT, lineHeight: 1.1, letterSpacing: '-0.02em' }}>DGFY Account</div>
                <div style={{ marginTop: 3, fontSize: 13, color: MUTED, lineHeight: 1.3 }}>Continue your orders, bookings, and saved activity.</div>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close DGFY account modal" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BORDER}`, background: '#F8FAFD', color: MUTED, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <X size={18} strokeWidth={2.1} />
            </button>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '0.85fr 1.15fr', minHeight: 0 }}>
            <aside style={{ background: LEFT_BG, borderRight: isMobileViewport ? 'none' : `1px solid ${BORDER}`, padding: isMobileViewport ? '18px 18px 16px' : '26px 26px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ borderRadius: 18, border: `1px solid ${PRIMARY_TINT}`, background: 'linear-gradient(135deg, rgba(174,232,244,0.34), rgba(255,255,255,0.92))', padding: 18, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(26,78,141,0.10)', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                    <User size={18} strokeWidth={2.1} />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>You are currently browsing as Guest</div>
                    <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.55, color: MUTED }}>Use one DGFY account for orders, bookings, saved details, tracking, and business ownership.</div>
                  </div>
                </div>
              </div>

              {hasSavedCustomerDetails ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Saved Details</div>
                  <div style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: '#fff', padding: 18, display: 'grid', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #d9f3fb, #c1e7f9)', color: PRIMARY, display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 800, flexShrink: 0 }}>{savedInitials}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{savedName}</div>
                        {savedContact ? <div style={{ marginTop: 4, fontSize: 13, color: MUTED }}>{savedContact}</div> : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontSize: 12, color: MUTED }}>{savedAgeLabel}</div>
                      <button type="button" onClick={onClearSavedDetails} style={{ border: 'none', background: 'transparent', color: DANGER, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        Clear details <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <PrimaryButton onClick={onContinueAsGuest}>
                Continue as Guest <ArrowRight size={18} strokeWidth={2.2} />
              </PrimaryButton>

              <div style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: '#fff', padding: '18px 18px 12px', display: 'grid', gap: 12 }}>
                {benefits.map((entry, index) => {
                  const Icon = entry.icon;
                  return (
                    <div key={entry.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: index === benefits.length - 1 ? 0 : 12, borderBottom: index === benefits.length - 1 ? 'none' : `1px solid ${BORDER}` }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: '#d9f3fb', color: PRIMARY, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <Icon size={18} strokeWidth={2.1} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{entry.title}</div>
                        <div style={{ marginTop: 3, fontSize: 13, lineHeight: 1.45, color: MUTED }}>{entry.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>

            <section style={{ padding: isMobileViewport ? '20px 18px 24px' : '28px 36px 30px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, background: SURFACE }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: isMobileViewport ? 22 : 24, fontWeight: 800, color: TEXT, lineHeight: 1.1, letterSpacing: '-0.025em' }}>Sign in once. Continue everywhere.</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: MUTED }}>Use your DGFY account for storefront activity today, then use the same account later if you decide to register a business.</div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <PrimaryButton onClick={onOpenAuth}>Sign in / Create Account</PrimaryButton>
                <button type="button" onClick={onOpenRegisterBusiness} style={{ width: '100%', height: 44, borderRadius: 10, border: `1px solid ${PRIMARY}`, background: '#fff', color: PRIMARY, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  Register Your Business
                </button>
              </div>
              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16, fontSize: 13, lineHeight: 1.55, color: MUTED }}>
                Password recovery is handled on the DGFY auth page so you can return to the same customer or business flow after reset.
              </div>
            </section>
          </div>
        </section>
      </div>
    </>
  );
}
