import React from 'react';
import { ShieldCheck, ShoppingBag, Store, Ticket, User, X } from 'lucide-react';

const SURFACE = '#FFFFFF';
const SOFT_SURFACE = '#F5F8FF';
const BORDER = '#E5EAF2';
const PRIMARY = '#0F6FFF';
const TEXT = '#101828';
const MUTED = '#667085';

export function DgfyCustomerAuthModal({
  isMobileViewport,
  onClose,
  customerAuthMode,
  customerAuthError,
  customerAuthSubmitting,
  dgfyLegalTermsLoading,
  customerSignInForm,
  customerRegisterForm,
  onCustomerAuthModeChange,
  onSignInFieldChange,
  onRegisterFieldChange,
  onSubmit
}) {
  const helperCopy = customerAuthMode === 'sign_in'
    ? 'Sign in to view your orders, bookings, tickets, saved details, and cross-store account history.'
    : 'Create a DGFY customer account to save orders, bookings, and future activity across all DGFY stores.';

  return (
    <>
      <button
        type="button"
        aria-label="Close DGFY account modal"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2498,
          border: 'none',
          background: 'rgba(15,23,42,0.56)',
          backdropFilter: 'blur(14px)',
          cursor: 'pointer'
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="DGFY Account"
        style={{
          position: 'fixed',
          inset: isMobileViewport ? '0' : '24px',
          zIndex: 2499,
          display: 'grid',
          placeItems: 'center',
          padding: isMobileViewport ? 0 : 20
        }}
      >
        <section
          style={{
            width: isMobileViewport ? '100vw' : 'min(980px, calc(100vw - 48px))',
            maxHeight: isMobileViewport ? '100vh' : 'min(92vh, 860px)',
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: isMobileViewport ? 0 : 28,
            boxShadow: '0 36px 84px rgba(15,23,42,0.18)',
            display: 'grid',
            gridTemplateRows: 'auto 1fr',
            overflow: 'hidden'
          }}
        >
          <header
            style={{
              padding: isMobileViewport ? '24px 18px 18px' : '30px 32px 24px',
              borderBottom: `1px solid ${BORDER}`,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 18,
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(18px)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, minWidth: 0 }}>
              <div
                style={{
                  width: isMobileViewport ? 56 : 64,
                  height: isMobileViewport ? 56 : 64,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0F6FFF 0%, #0A5BD8 100%)',
                  color: '#FFFFFF',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  boxShadow: '0 12px 28px rgba(15,111,255,0.22)'
                }}
              >
                <User size={isMobileViewport ? 24 : 28} strokeWidth={2.2} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: isMobileViewport ? 28 : 32, fontWeight: 700, lineHeight: 1.04, color: TEXT, letterSpacing: '-0.03em' }}>
                  DGFY Account
                </div>
                <p style={{ margin: '10px 0 0 0', fontSize: isMobileViewport ? 15 : 16, lineHeight: 1.6, color: MUTED, maxWidth: 620 }}>
                  Sign in once to access orders, bookings, saved details, and your customer activity across DGFY stores.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close DGFY account modal"
              style={{
                width: isMobileViewport ? 48 : 54,
                height: isMobileViewport ? 48 : 54,
                borderRadius: '50%',
                border: `1px solid ${BORDER}`,
                background: '#F8FAFC',
                color: TEXT,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <X size={isMobileViewport ? 22 : 24} strokeWidth={2.3} />
            </button>
          </header>

          <div
            style={{
              overflowY: 'auto',
              padding: isMobileViewport ? '18px 16px 22px' : '28px 32px 32px',
              display: 'grid',
              gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 0.95fr) minmax(0, 1.05fr)',
              gap: 24,
              alignContent: 'start'
            }}
          >
            <div
              style={{
                borderRadius: 24,
                background: SOFT_SURFACE,
                border: `1px solid ${BORDER}`,
                padding: isMobileViewport ? 18 : 22,
                display: 'grid',
                gap: 18,
                alignContent: 'start'
              }}
            >
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Why use a DGFY customer account?</div>
                <div style={{ fontSize: 15, lineHeight: 1.7, color: MUTED }}>
                  Your account keeps customer activity in one place while still allowing guest ordering when a store permits it.
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {[
                  { icon: ShoppingBag, title: 'Orders across stores', body: 'See your order history, references, and active statuses in one account.' },
                  { icon: Ticket, title: 'Bookings and tickets', body: 'Access bookings, service activity, and future customer tickets from the same profile.' },
                  { icon: Store, title: 'Saved customer details', body: 'Reuse your customer details and continue faster on future checkouts.' }
                ].map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <div key={entry.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 14, background: '#FFFFFF', border: `1px solid ${BORDER}`, color: PRIMARY, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <Icon size={18} strokeWidth={2.1} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{entry.title}</div>
                        <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.6, color: MUTED }}>{entry.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ borderRadius: 18, border: '1px dashed #C9D9F2', background: '#FFFFFF', padding: '16px 18px', fontSize: 14, lineHeight: 1.65, color: '#475467' }}>
                You can still place orders as a guest when the store allows it. Creating an account is recommended, not required, for normal ordering.
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                background: '#FFFFFF',
                border: `1px solid ${BORDER}`,
                padding: isMobileViewport ? 18 : 24,
                display: 'grid',
                gap: 18,
                alignContent: 'start',
                boxShadow: '0 10px 30px rgba(15,23,42,0.05)'
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, border: `1px solid ${BORDER}`, background: '#F8FAFC', padding: 4, width: 'fit-content' }}>
                <button
                  type="button"
                  onClick={() => onCustomerAuthModeChange('sign_in')}
                  style={{
                    minHeight: 40,
                    borderRadius: 999,
                    border: 'none',
                    background: customerAuthMode === 'sign_in' ? PRIMARY : 'transparent',
                    color: customerAuthMode === 'sign_in' ? '#FFFFFF' : '#344054',
                    padding: '0 18px',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => onCustomerAuthModeChange('create_account')}
                  style={{
                    minHeight: 40,
                    borderRadius: 999,
                    border: 'none',
                    background: customerAuthMode === 'create_account' ? PRIMARY : 'transparent',
                    color: customerAuthMode === 'create_account' ? '#FFFFFF' : '#344054',
                    padding: '0 18px',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Create account
                </button>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>
                  {customerAuthMode === 'sign_in' ? 'Welcome back' : 'Create your customer account'}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.6, color: MUTED }}>
                  {helperCopy}
                </div>
              </div>

              {customerAuthError ? (
                <div style={{ borderRadius: 16, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B42318', padding: '12px 14px', fontSize: 13, lineHeight: 1.5 }}>
                  {customerAuthError}
                </div>
              ) : null}

              {customerAuthMode === 'sign_in' ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <input
                    value={customerSignInForm.email}
                    onChange={(event) => onSignInFieldChange('email', event.target.value)}
                    placeholder="Email"
                    autoComplete="email"
                    style={{ width: '100%', minHeight: 52, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '0 16px', fontSize: 15, color: TEXT, background: '#FFFFFF' }}
                  />
                  <input
                    type="password"
                    value={customerSignInForm.password}
                    onChange={(event) => onSignInFieldChange('password', event.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                    style={{ width: '100%', minHeight: 52, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '0 16px', fontSize: 15, color: TEXT, background: '#FFFFFF' }}
                  />
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={customerAuthSubmitting}
                    style={{ minHeight: 52, borderRadius: 16, border: `1px solid ${PRIMARY}`, background: customerAuthSubmitting ? '#8CB7FF' : PRIMARY, color: '#FFFFFF', padding: '0 18px', fontSize: 15, fontWeight: 700, cursor: customerAuthSubmitting ? 'wait' : 'pointer' }}
                  >
                    {customerAuthSubmitting ? 'Signing in...' : 'Sign in with DGFY'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <input value={customerRegisterForm.first_name} onChange={(event) => onRegisterFieldChange('first_name', event.target.value)} placeholder="First name" autoComplete="given-name" style={{ width: '100%', minHeight: 52, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '0 16px', fontSize: 15, color: TEXT, background: '#FFFFFF' }} />
                    <input value={customerRegisterForm.last_name} onChange={(event) => onRegisterFieldChange('last_name', event.target.value)} placeholder="Last name" autoComplete="family-name" style={{ width: '100%', minHeight: 52, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '0 16px', fontSize: 15, color: TEXT, background: '#FFFFFF' }} />
                  </div>
                  <input value={customerRegisterForm.email} onChange={(event) => onRegisterFieldChange('email', event.target.value)} placeholder="Email" autoComplete="email" style={{ width: '100%', minHeight: 52, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '0 16px', fontSize: 15, color: TEXT, background: '#FFFFFF' }} />
                  <input value={customerRegisterForm.phone} onChange={(event) => onRegisterFieldChange('phone', event.target.value)} placeholder="Mobile number" autoComplete="tel" style={{ width: '100%', minHeight: 52, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '0 16px', fontSize: 15, color: TEXT, background: '#FFFFFF' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <input type="password" value={customerRegisterForm.password} onChange={(event) => onRegisterFieldChange('password', event.target.value)} placeholder="Password" autoComplete="new-password" style={{ width: '100%', minHeight: 52, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '0 16px', fontSize: 15, color: TEXT, background: '#FFFFFF' }} />
                    <input type="password" value={customerRegisterForm.confirm_password} onChange={(event) => onRegisterFieldChange('confirm_password', event.target.value)} placeholder="Confirm password" autoComplete="new-password" style={{ width: '100%', minHeight: 52, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '0 16px', fontSize: 15, color: TEXT, background: '#FFFFFF' }} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#475467', lineHeight: 1.5 }}>
                    <input type="checkbox" checked={customerRegisterForm.accepted_terms} onChange={(event) => onRegisterFieldChange('accepted_terms', event.target.checked)} style={{ width: 16, height: 16, marginTop: 2 }} />
                    <span>I agree to the DGFY account terms, privacy policy, and marketplace terms required for account registration.</span>
                  </label>
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={customerAuthSubmitting || dgfyLegalTermsLoading}
                    style={{ minHeight: 52, borderRadius: 16, border: `1px solid ${PRIMARY}`, background: (customerAuthSubmitting || dgfyLegalTermsLoading) ? '#8CB7FF' : PRIMARY, color: '#FFFFFF', padding: '0 18px', fontSize: 15, fontWeight: 700, cursor: (customerAuthSubmitting || dgfyLegalTermsLoading) ? 'wait' : 'pointer' }}
                  >
                    {customerAuthSubmitting ? 'Creating account...' : (dgfyLegalTermsLoading ? 'Loading registration requirements...' : 'Create DGFY account')}
                  </button>
                </div>
              )}

              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                DGFY customer accounts are for shoppers. Business registration stays separate and continues in SKUpervisor.
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

export default DgfyCustomerAuthModal;
