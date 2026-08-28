import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RetailOrderGuestEmailVerification } from './RetailOrderGuestEmailVerification.jsx';

const RETAIL_ACCENT = '#1a4e8d';
const RETAIL_ACCENT_DARK = '#1a4586';

/**
 * Retail order page's Account step. Mirrors
 * modes/fnb/checkout/components/FnbCheckoutCustomerStep.jsx's composition (identity content +
 * guest email OTP verification + notice + Back/Continue), using the same shared, mode-agnostic
 * identity infrastructure F&B/MSME already use:
 * `renderGuestCheckoutEntry`/`renderGuestIdentityFields`/`renderAccountOwnedIdentitySummary`
 * (from `useGuestCustomerIdentity`, instantiated once in `StorefrontApp.jsx`) and the guest OTP
 * state/handlers (from `useGuestCheckoutOtp`, also instantiated once and shared across
 * modes despite the "Fnb" name — it takes no F&B-specific state). No new backend calls were
 * added here; this step is now real, not a placeholder.
 */
export function RetailOrderAccountStep({
  canUseGuestCheckoutFlow = false,
  guestCheckoutAllowed = true,
  guestCheckoutOtpCode = '',
  guestCheckoutOtpCooldownLabel = '',
  guestCheckoutOtpError = '',
  guestCheckoutOtpLoading = false,
  guestCheckoutOtpVerified = false,
  isDgfyCustomerSignedIn = false,
  isGuestCheckoutOtpCooldownActive = false,
  isMobileViewport = false,
  retailCustomerStepComplete = false,
  servicesBodyFont,
  renderAccountOwnedIdentitySummary,
  renderGuestCheckoutEntry,
  renderGuestIdentityFields,
  onBackToCatalog,
  onContinue,
  onApplyGuestDetailsAndRequestOtp,
  onGuestCheckoutOtpCodeChange,
  onRequestGuestCheckoutOtp,
  onVerifyGuestCheckoutOtp
}) {
  if (!isDgfyCustomerSignedIn && !canUseGuestCheckoutFlow) {
    return renderGuestCheckoutEntry({
      title: 'Continue to your order',
      // #622: the description must track guestCheckoutAllowed the same way the "Continue as
      // Guest" button itself does -- a hardcoded description here would keep inviting guest
      // checkout in copy even after the merchant disabled it (caught by rendered-UI proof,
      // PR #1095 RF-3: the button correctly disappeared but this text didn't change).
      description: guestCheckoutAllowed
        ? 'Create an account or continue as guest to continue this order.'
        : 'This store requires a DGFY account to check out. Create one or log in to continue.',
      resumeTarget: {
        checkoutTab: 'checkout'
      }
    });
  }

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 1: Customer Details</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>
        {isDgfyCustomerSignedIn
          ? 'Your account details are already linked. Only order-specific instructions remain editable here.'
          : 'Guest checkout uses the details you entered for this order only.'}
      </div>
      {isDgfyCustomerSignedIn ? renderAccountOwnedIdentitySummary({
        title: 'Customer Account',
        subtitle: 'These account details will be used for this order.'
      }) : renderGuestIdentityFields({
        title: 'Guest Details',
        subtitle: 'These guest details will be used for this order.',
        includeAddress: false,
        requireEmail: true,
        layoutVariant: 'fnbGuest',
        savedDetailsApplyLabel: 'Send Code and Apply Details',
        onSavedDetailsApply: onApplyGuestDetailsAndRequestOtp
      })}
      {!isDgfyCustomerSignedIn && (
        <RetailOrderGuestEmailVerification
          bodyFont={servicesBodyFont}
          code={guestCheckoutOtpCode}
          cooldownActive={isGuestCheckoutOtpCooldownActive}
          cooldownLabel={guestCheckoutOtpCooldownLabel}
          error={guestCheckoutOtpError}
          isMobileViewport={isMobileViewport}
          loading={guestCheckoutOtpLoading}
          onCodeChange={onGuestCheckoutOtpCodeChange}
          onRequestCode={onRequestGuestCheckoutOtp}
          onVerifyCode={onVerifyGuestCheckoutOtp}
          verified={guestCheckoutOtpVerified}
        />
      )}
      {!isMobileViewport && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onBackToCatalog} style={{ minHeight: isMobileViewport ? 44 : 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back to Catalog</button>
          <button type="button" onClick={onContinue} disabled={!retailCustomerStepComplete} style={{ minHeight: isMobileViewport ? 44 : 46, borderRadius: 12, border: 'none', background: retailCustomerStepComplete ? `linear-gradient(180deg, ${RETAIL_ACCENT} 0%, ${RETAIL_ACCENT_DARK} 100%)` : '#cbd5e1', color: '#fff', fontWeight: 700, cursor: retailCustomerStepComplete ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue <ChevronRight size={18} /></button>
        </div>
      )}
      {!retailCustomerStepComplete && (
        <div style={{ fontSize: 12, color: '#b45309' }}>
          {isDgfyCustomerSignedIn ? 'Complete required fields to continue.' : 'Add your name and email, then verify your email to continue.'}
        </div>
      )}
    </section>
  );
}
