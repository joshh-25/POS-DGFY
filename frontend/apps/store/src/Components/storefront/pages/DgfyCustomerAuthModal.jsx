import React from 'react';
import {
  ArrowRight,
  CalendarCheck2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  User,
  X
} from 'lucide-react';

/* ─────────────────────────────────────────────
   DGFY design tokens
───────────────────────────────────────────── */
const PRIMARY      = '#0F6FFF';
const PRIMARY_DARK = '#0A52CC';
const PRIMARY_TINT = '#EBF3FF';
const PRIMARY_RING = '#C4D9FF';
const TEXT         = '#101828';
const TEXT_SOFT    = '#344054';
const MUTED        = '#667085';
const BORDER       = '#E2EAFF';
const SURFACE      = '#FFFFFF';
const LEFT_BG      = '#F4F8FF';
const DANGER       = '#D92D20';

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────
   AuthInput — 46 px field with focus ring
───────────────────────────────────────────── */
function AuthInput({ icon: Icon, placeholder, value, onChange, autoComplete, type = 'text', rightAction = null }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <label
      style={{
        width: '100%',
        height: 46,
        borderRadius: 10,
        border: `1.5px solid ${focused ? PRIMARY : BORDER}`,
        background: SURFACE,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 14px',
        boxSizing: 'border-box',
        cursor: 'text',
        transition: 'border-color 140ms ease, box-shadow 140ms ease',
        boxShadow: focused ? `0 0 0 3px rgba(15,111,255,0.12)` : 'none'
      }}
    >
      <span
        style={{
          color: focused ? PRIMARY : '#98A2B3',
          display: 'inline-flex',
          alignItems: 'center',
          flexShrink: 0,
          transition: 'color 140ms ease'
        }}
      >
        <Icon size={16} strokeWidth={2} />
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: TEXT,
          fontSize: 14,
          fontWeight: 400
        }}
      />
      {rightAction}
    </label>
  );
}

/* ─────────────────────────────────────────────
   PrimaryButton — DGFY blue full-width 44 px
───────────────────────────────────────────── */
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
        background: disabled
          ? '#93B8FF'
          : `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%)`,
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: '0.01em',
        cursor: disabled ? 'wait' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        boxShadow: disabled ? 'none' : '0 4px 16px rgba(15,111,255,0.30)',
        transition: 'opacity 150ms ease, box-shadow 150ms ease',
        ...style
      }}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────
   EyeToggle
───────────────────────────────────────────── */
function EyeToggle({ show, onToggle, label }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onToggle}
      style={{
        border: 'none',
        background: 'transparent',
        color: '#98A2B3',
        display: 'inline-flex',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0
      }}
    >
      {show ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
    </button>
  );
}

/* ─────────────────────────────────────────────
   DgfyCustomerAuthModal
───────────────────────────────────────────── */
export function DgfyCustomerAuthModal({
  isMobileViewport,
  onClose,
  customerAuthMode,
  customerAuthError,
  customerAuthSubmitting,
  dgfyLegalTermsLoading,
  customerSignInForm,
  customerRegisterForm,
  savedCustomerDetails,
  hasSavedCustomerDetails,
  onCustomerAuthModeChange,
  onSignInFieldChange,
  onRegisterFieldChange,
  onSubmit,
  onContinueAsGuest,
  onClearSavedDetails,
  onForgotPassword
}) {
  const [rememberMe,                  setRememberMe]                  = React.useState(true);
  const [showSignInPassword,          setShowSignInPassword]          = React.useState(false);
  const [showRegisterPassword,        setShowRegisterPassword]        = React.useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = React.useState(false);

  const savedName     = String(savedCustomerDetails?.name || '').trim() || 'Saved customer';
  const savedContact  = toMaskedContact(savedCustomerDetails);
  const savedInitials = toInitials(savedName);
  const savedAgeLabel = formatSavedAge(savedCustomerDetails?.updatedAt);
  const isSignIn      = customerAuthMode === 'sign_in';

  const BENEFITS = [
    { icon: ShoppingBag,    title: 'Orders',        body: 'Track your orders across all DGFY stores.' },
    { icon: CalendarCheck2, title: 'Bookings',      body: 'View your bookings and service activity.' },
    { icon: ShieldCheck,    title: 'Saved Details', body: 'Securely save your details for faster checkout.' }
  ];

  return (
    <>
      {/* ── backdrop ── */}
      <button
        type="button"
        aria-label="Close DGFY account modal"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2498,
          border: 'none',
          background: 'rgba(8,16,42,0.68)',
          backdropFilter: 'blur(12px)',
          cursor: 'pointer'
        }}
      />

      {/* ── centring shell ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="DGFY Account"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2499,
          display: 'flex',
          alignItems: isMobileViewport ? 'flex-end' : 'center',
          justifyContent: 'center',
          padding: isMobileViewport ? 0 : '20px 16px'
        }}
      >
        {/* ── modal card ── */}
        <section
          style={{
            width: isMobileViewport ? '100vw' : 'min(1020px, calc(100vw - 24px))',
            maxHeight: isMobileViewport ? '96vh' : 'min(92vh, 860px)',
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: isMobileViewport ? '20px 20px 0 0' : 20,
            boxShadow: '0 24px 80px rgba(8,16,42,0.22)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >

          {/* ═══ HEADER ═══ */}
          <header
            style={{
              padding: isMobileViewport ? '16px 18px 14px' : '20px 26px 18px',
              borderBottom: `1px solid ${BORDER}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexShrink: 0,
              background: SURFACE
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              {/* logo circle */}
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  background: `linear-gradient(140deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%)`,
                  color: '#FFFFFF',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  boxShadow: '0 6px 18px rgba(15,111,255,0.30)'
                }}
              >
                <User size={22} strokeWidth={2.2} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: isMobileViewport ? 17 : 19, fontWeight: 800, color: TEXT, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                  DGFY Account
                </div>
                <div style={{ marginTop: 3, fontSize: 13, color: MUTED, lineHeight: 1.3 }}>
                  Continue your orders, bookings, and saved activity.
                </div>
              </div>
            </div>

            {/* close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close DGFY account modal"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: `1px solid ${BORDER}`,
                background: '#F8FAFD',
                color: TEXT,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <X size={17} strokeWidth={2.2} />
            </button>
          </header>

          {/* ═══ BODY ═══ */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: isMobileViewport ? 'flex' : 'grid',
              flexDirection: isMobileViewport ? 'column' : undefined,
              gridTemplateColumns: isMobileViewport ? undefined : 'minmax(0, 420px) 1fr'
            }}
          >

            {/* ══ LEFT PANEL ══ */}
            <aside
              style={{
                padding: isMobileViewport ? '18px 18px 14px' : '22px 22px 20px',
                borderRight: isMobileViewport ? 'none' : `1px solid ${BORDER}`,
                borderBottom: isMobileViewport ? `1px solid ${BORDER}` : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                background: LEFT_BG,
                flexShrink: 0
              }}
            >
              {/* ── Guest status ── */}
              <div
                style={{
                  borderRadius: 14,
                  border: `1px solid ${PRIMARY_RING}`,
                  background: 'linear-gradient(135deg, rgba(15,111,255,0.07) 0%, rgba(15,111,255,0.02) 100%)',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: PRIMARY_TINT,
                    color: PRIMARY,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0
                  }}
                >
                  <User size={18} strokeWidth={2.1} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, lineHeight: 1.4 }}>
                    You are currently browsing as{' '}
                    <span style={{ color: PRIMARY }}>Guest</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
                    Browse freely and place orders.<br />
                    Sign in anytime to save and access your activity.
                  </div>
                </div>
              </div>

              {/* ── Saved Details ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Saved Details</div>

                <div
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${BORDER}`,
                    background: SURFACE,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16
                  }}
                >
                  {hasSavedCustomerDetails ? (
                    <>
                      {/* avatar + name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #C2D9FF 0%, #DCE9FF 100%)',
                            color: PRIMARY,
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 17,
                            fontWeight: 800,
                            flexShrink: 0,
                            letterSpacing: '-0.01em'
                          }}
                        >
                          {savedInitials}
                        </div>
                        <div
                          style={{
                            minWidth: 0,
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                            flexWrap: 'wrap'
                          }}
                        >
                          <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, lineHeight: 1.2 }}>
                            {savedName}
                          </div>
                          {savedContact ? (
                            <>
                              <span style={{ fontSize: 12, color: MUTED, opacity: 0.6, userSelect: 'none' }}>•</span>
                              <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, lineHeight: 1.2 }}>
                                {savedContact}
                              </div>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 12, color: MUTED, opacity: 0.6, userSelect: 'none' }}>•</span>
                              <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, lineHeight: 1.2 }}>
                                —
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* timestamp + clear */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          flexWrap: 'wrap'
                        }}
                      >
                        <span style={{ fontSize: 13, color: MUTED }}>{savedAgeLabel}</span>
                        <button
                          type="button"
                          onClick={onClearSavedDetails}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: DANGER,
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Clear details
                          <Trash2 size={13} strokeWidth={2.2} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                      No saved details yet. Complete a checkout once to continue faster next time.
                    </div>
                  )}
                </div>
              </div>

              {/* ── Continue as Guest ── */}
              <PrimaryButton
                onClick={onContinueAsGuest}
                style={{ justifyContent: 'space-between', paddingInline: 20 }}
              >
                <span style={{ flex: 1, textAlign: 'center' }}>Continue as Guest</span>
                <ArrowRight size={16} strokeWidth={2.4} />
              </PrimaryButton>

              {/* ── Benefits ── */}
              <div
                style={{
                  borderRadius: 14,
                  border: `1px solid ${BORDER}`,
                  background: SURFACE,
                  padding: '8px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0
                }}
              >
                {BENEFITS.map((entry, idx) => {
                  const Icon = entry.icon;
                  return (
                    <div
                      key={entry.title}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '11px 0',
                        borderTop: idx === 0 ? 'none' : `1px solid ${BORDER}`
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: PRIMARY_TINT,
                          color: PRIMARY,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0
                        }}
                      >
                        <Icon size={16} strokeWidth={2.1} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, lineHeight: 1 }}>
                          {entry.title}
                        </div>
                        <div style={{ marginTop: 3, fontSize: 12, color: MUTED, lineHeight: 1.4 }}>
                          {entry.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Privacy note (inline, no card) ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: MUTED, fontSize: 12 }}>
                <ShieldCheck size={14} strokeWidth={2} color={PRIMARY} style={{ flexShrink: 0 }} />
                <span>Your data is safe with us. We never share your information.</span>
              </div>
            </aside>

            {/* ══ RIGHT PANEL ══ */}
            <section
              style={{
                padding: isMobileViewport ? '20px 18px 24px' : '26px 36px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                background: SURFACE
              }}
            >
              {/* ── Tab switcher ── */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 4,
                  padding: 4,
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  background: '#F1F5F9'
                }}
              >
                {[
                  { mode: 'sign_in',        label: 'Sign in' },
                  { mode: 'create_account', label: 'Create Account' }
                ].map(({ mode, label }) => {
                  const active = customerAuthMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onCustomerAuthModeChange(mode)}
                      style={{
                        height: 38,
                        borderRadius: 9,
                        border: 'none',
                        background: active
                          ? `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%)`
                          : 'transparent',
                        color: active ? '#FFFFFF' : TEXT_SOFT,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background 160ms ease, color 160ms ease',
                        boxShadow: active ? '0 3px 10px rgba(15,111,255,0.28)' : 'none'
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* ── Heading ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div
                  style={{
                    fontSize: isMobileViewport ? 22 : 24,
                    fontWeight: 800,
                    color: TEXT,
                    lineHeight: 1.1,
                    letterSpacing: '-0.025em'
                  }}
                >
                  {isSignIn ? 'Welcome back!' : 'Create your account'}
                </div>
                <div style={{ fontSize: 14, color: MUTED }}>
                  {isSignIn
                    ? 'Sign in to continue to your account.'
                    : 'Fill in your details to get started.'}
                </div>
              </div>

              {/* ── Error banner ── */}
              {customerAuthError ? (
                <div
                  style={{
                    borderRadius: 10,
                    border: '1px solid #FECACA',
                    background: '#FEF2F2',
                    color: '#B42318',
                    padding: '10px 14px',
                    fontSize: 13,
                    lineHeight: 1.5
                  }}
                >
                  {customerAuthError}
                </div>
              ) : null}

              {/* ── SIGN IN FORM ── */}
              {isSignIn ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <AuthInput
                    icon={Mail}
                    placeholder="Email or phone number"
                    value={customerSignInForm.email}
                    onChange={(e) => onSignInFieldChange('email', e.target.value)}
                    autoComplete="username"
                  />

                  <AuthInput
                    icon={Lock}
                    placeholder="Password"
                    value={customerSignInForm.password}
                    onChange={(e) => onSignInFieldChange('password', e.target.value)}
                    autoComplete="current-password"
                    type={showSignInPassword ? 'text' : 'password'}
                    rightAction={
                      <EyeToggle
                        show={showSignInPassword}
                        onToggle={() => setShowSignInPassword((p) => !p)}
                        label={showSignInPassword ? 'Hide password' : 'Show password'}
                      />
                    }
                  />

                  {/* Remember me / Forgot */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      marginTop: 8
                    }}
                  >
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 14,
                        color: TEXT_SOFT,
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: PRIMARY }}
                      />
                      <span style={{ fontWeight: 600 }}>Remember me</span>
                    </label>

                    <button
                      type="button"
                      onClick={onForgotPassword}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: PRIMARY,
                        padding: 0,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>

                  <PrimaryButton onClick={onSubmit} disabled={customerAuthSubmitting}>
                    {customerAuthSubmitting ? 'Signing in…' : 'Sign in to DGFY'}
                  </PrimaryButton>

                  <div
                    style={{
                      paddingTop: 16,
                      borderTop: `1px solid ${BORDER}`,
                      textAlign: 'center',
                      fontSize: 14,
                      color: MUTED
                    }}
                  >
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => onCustomerAuthModeChange('create_account')}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: PRIMARY,
                        padding: 0,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Create account
                    </button>
                  </div>
                </div>
              ) : (
                /* ── CREATE ACCOUNT FORM ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Name row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr',
                      gap: 12
                    }}
                  >
                    <AuthInput
                      icon={User}
                      placeholder="First Name"
                      value={customerRegisterForm.first_name}
                      onChange={(e) => onRegisterFieldChange('first_name', e.target.value)}
                      autoComplete="given-name"
                    />
                    <AuthInput
                      icon={User}
                      placeholder="Last Name"
                      value={customerRegisterForm.last_name}
                      onChange={(e) => onRegisterFieldChange('last_name', e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>

                  <AuthInput
                    icon={Mail}
                    placeholder="Email"
                    value={customerRegisterForm.email}
                    onChange={(e) => onRegisterFieldChange('email', e.target.value)}
                    autoComplete="email"
                  />

                  <AuthInput
                    icon={Phone}
                    placeholder="Phone Number"
                    value={customerRegisterForm.phone}
                    onChange={(e) => onRegisterFieldChange('phone', e.target.value)}
                    autoComplete="tel"
                  />

                  <AuthInput
                    icon={Lock}
                    placeholder="Password"
                    value={customerRegisterForm.password}
                    onChange={(e) => onRegisterFieldChange('password', e.target.value)}
                    autoComplete="new-password"
                    type={showRegisterPassword ? 'text' : 'password'}
                    rightAction={
                      <EyeToggle
                        show={showRegisterPassword}
                        onToggle={() => setShowRegisterPassword((p) => !p)}
                        label={showRegisterPassword ? 'Hide password' : 'Show password'}
                      />
                    }
                  />

                  <AuthInput
                    icon={Lock}
                    placeholder="Confirm Password"
                    value={customerRegisterForm.confirm_password}
                    onChange={(e) => onRegisterFieldChange('confirm_password', e.target.value)}
                    autoComplete="new-password"
                    type={showRegisterConfirmPassword ? 'text' : 'password'}
                    rightAction={
                      <EyeToggle
                        show={showRegisterConfirmPassword}
                        onToggle={() => setShowRegisterConfirmPassword((p) => !p)}
                        label={showRegisterConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      />
                    }
                  />

                  {/* Terms */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 9,
                      fontSize: 13,
                      color: '#475467',
                      lineHeight: 1.6,
                      cursor: 'pointer',
                      marginTop: 8
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={customerRegisterForm.accepted_terms}
                      onChange={(e) => onRegisterFieldChange('accepted_terms', e.target.checked)}
                      style={{
                        width: 15,
                        height: 15,
                        marginTop: 3,
                        accentColor: PRIMARY,
                        flexShrink: 0
                      }}
                    />
                    <span>
                      I agree to the{' '}
                      <span style={{ color: PRIMARY, fontWeight: 700 }}>Terms of Service</span>
                      {' '}and{' '}
                      <span style={{ color: PRIMARY, fontWeight: 700 }}>Privacy Policy</span>.
                    </span>
                  </label>

                  <PrimaryButton
                    onClick={onSubmit}
                    disabled={customerAuthSubmitting || dgfyLegalTermsLoading}
                  >
                    {customerAuthSubmitting
                      ? 'Creating account…'
                      : dgfyLegalTermsLoading
                        ? 'Loading requirements…'
                        : 'Create Account'}
                  </PrimaryButton>

                  <div
                    style={{
                      paddingTop: 16,
                      borderTop: `1px solid ${BORDER}`,
                      textAlign: 'center',
                      fontSize: 14,
                      color: MUTED
                    }}
                  >
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => onCustomerAuthModeChange('sign_in')}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: PRIMARY,
                        padding: 0,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Sign in
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </>
  );
}

export default DgfyCustomerAuthModal;
