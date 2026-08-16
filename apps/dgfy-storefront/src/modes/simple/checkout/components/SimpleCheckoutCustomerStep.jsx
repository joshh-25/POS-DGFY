import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SimpleCheckoutGuestEmailVerification } from './SimpleCheckoutGuestEmailVerification.jsx';

const SIMPLE_BRAND = '#176B3A';
const SIMPLE_BRAND_DARK = '#0F5A30';

/**
 * MSME (Simple) order page's Account step. Mirrors
 * modes/fnb/checkout/components/FnbCheckoutCustomerStep.jsx's composition (identity content +
 * guest email OTP verification + notice + Back/Continue), matching the same functionality now
 * built for Retail (RetailOrderAccountStep.jsx). Uses the same shared, mode-agnostic identity
 * infrastructure F&B already uses: `renderGuestCheckoutEntry`/`renderGuestIdentityFields`/
 * `renderAccountOwnedIdentitySummary` (from `useGuestCustomerIdentity`, instantiated once in
 * StorefrontApp.jsx) and the guest OTP state/handlers (from `useFnbGuestCheckoutOtp`, also
 * instantiated once and shared across modes despite the "Fnb" name).
 */
export function SimpleCheckoutCustomerStep({
  canUseGuestCheckoutFlow = false,
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
  servicesBodyFont,
  simpleCustomerStepComplete = false,
  onApplyGuestDetailsAndRequestOtp,
  onBackToCatalog,
  onContinue,
  onGuestCheckoutOtpCodeChange,
  onRequestGuestCheckoutOtp,
  onVerifyGuestCheckoutOtp
}) {
  if (!isDgfyCustomerSignedIn && !canUseGuestCheckoutFlow) {
    return renderGuestCheckoutEntry({
      title: 'Continue to your order',
      description: 'Create an account or continue as guest to continue this order.',
      resumeTarget: {
        checkoutTab: 'checkout',
        simpleOrderStep: 1
      }
    });
  }

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Step 1: Customer Details</div>
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
        <SimpleCheckoutGuestEmailVerification
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
          <button type="button" onClick={onBackToCatalog} style={{ minHeight: 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back to Catalog</button>
          <button type="button" onClick={onContinue} disabled={!simpleCustomerStepComplete} style={{ minHeight: 46, borderRadius: 12, border: 'none', background: simpleCustomerStepComplete ? `linear-gradient(180deg, ${SIMPLE_BRAND} 0%, ${SIMPLE_BRAND_DARK} 100%)` : '#cbd5e1', color: '#fff', fontWeight: 700, cursor: simpleCustomerStepComplete ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue <ChevronRight size={18} /></button>
        </div>
      )}
      {!simpleCustomerStepComplete && (
        <div style={{ fontSize: 12, color: '#b45309' }}>
          {isDgfyCustomerSignedIn ? 'Complete required fields to continue.' : 'Add your name and email, then verify your email to continue.'}
        </div>
      )}
    </section>
  );
}
