import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SimpleCheckoutGuestEmailVerification } from './SimpleCheckoutGuestEmailVerification.jsx';
import { GUEST_CHECKOUT_FONT_FAMILY, getGuestCheckoutTypography } from '../../../../shared/components/checkout/guestCheckoutTypography.js';

const SIMPLE_BRAND = '#176B3A';
const SIMPLE_BRAND_DARK = '#0F5A30';

/**
 * MSME (Simple) order page's Account step. Mirrors
 * modes/fnb/checkout/components/FnbCheckoutCustomerStep.jsx's composition (identity content +
 * guest email OTP verification + notice + Back/Continue), matching the same functionality now
 * built for Retail (RetailOrderAccountStep.jsx). Uses the same shared, mode-agnostic identity
 * infrastructure F&B already uses: `renderGuestCheckoutEntry`/`renderGuestIdentityFields`/
 * `renderAccountOwnedIdentitySummary` (from `useGuestCustomerIdentity`, instantiated once in
 * StorefrontApp.jsx) and the guest OTP state/handlers (from `useGuestCheckoutOtp`, also
 * instantiated once and shared across modes despite the "Fnb" name).
 */
export function SimpleCheckoutCustomerStep({
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
  renderAccountOwnedIdentitySummary,
  renderGuestCheckoutEntry,
  renderGuestIdentityFields,
  simpleCustomerStepComplete = false,
  onApplyGuestDetailsAndRequestOtp,
  onBackToCatalog,
  onContinue,
  onGuestCheckoutOtpCodeChange,
  onRequestGuestCheckoutOtp,
  onVerifyGuestCheckoutOtp
}) {
  const typography = getGuestCheckoutTypography(isMobileViewport);

  if (!isDgfyCustomerSignedIn && !canUseGuestCheckoutFlow) {
    return renderGuestCheckoutEntry({
      title: 'Continue to your order',
      // #622: track guestCheckoutAllowed the same way the "Continue as Guest" button does --
      // a hardcoded description would keep inviting guest checkout in copy even after the
      // merchant disabled it (PR #1095 RF-3, caught by rendered-UI proof).
      description: guestCheckoutAllowed
        ? 'Create an account or continue as guest to continue this order.'
        : 'This store requires a DGFY account to check out. Create one or log in to continue.',
      resumeTarget: {
        checkoutTab: 'checkout',
        simpleOrderStep: 1
      }
    });
  }

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 24, display: 'grid', gap: isMobileViewport ? 16 : 24, fontFamily: GUEST_CHECKOUT_FONT_FAMILY }}>
      <div style={{ ...typography.accountTitle, color: '#1e293b' }}>Step 1: Customer Details</div>
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
        <SimpleCheckoutGuestEmailVerification
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
          <button type="button" onClick={onBackToCatalog} style={{ minHeight: 44, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: typography.action.fontSize, fontFamily: GUEST_CHECKOUT_FONT_FAMILY, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back to Catalog</button>
          <button type="button" onClick={onContinue} disabled={!simpleCustomerStepComplete} style={{ minHeight: 44, borderRadius: 12, border: 'none', background: simpleCustomerStepComplete ? `linear-gradient(180deg, ${SIMPLE_BRAND} 0%, ${SIMPLE_BRAND_DARK} 100%)` : '#cbd5e1', color: '#fff', fontSize: typography.action.fontSize, fontFamily: GUEST_CHECKOUT_FONT_FAMILY, fontWeight: 700, cursor: simpleCustomerStepComplete ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue <ChevronRight size={18} /></button>
        </div>
      )}
    </section>
  );
}
