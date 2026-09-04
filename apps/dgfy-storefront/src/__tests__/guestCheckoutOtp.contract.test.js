import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..', '..');
const readAppSource = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
const readRepoSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Storefront guest checkout OTP contract', () => {
  it('keeps the backend guest OTP endpoints and checkout proof field available', () => {
    const routesSource = readRepoSource('apps/dgfy-api/src/routes/store.js');
    const validatorSource = readRepoSource('apps/dgfy-api/src/validators/storeValidator.js');

    expect(routesSource).toContain("/checkout/guest-otp/request");
    expect(routesSource).toContain("/checkout/guest-otp/verify");
    expect(validatorSource).toContain('guest_checkout_proof');
  });

  it('shares guest OTP enforcement across transaction-capable checkout modes', () => {
    const appSource = readAppSource('StorefrontApp.jsx');
    const modelSource = readAppSource('shared/checkout/model/guestCheckoutOtp.js');
    const hookSource = readAppSource('shared/checkout/hooks/useGuestCheckoutOtp.js');
    const fnbComponentSource = readAppSource('modes/fnb/checkout/components/FnbGuestEmailVerification.jsx');
    const sharedVerificationSource = readAppSource('shared/components/checkout/GuestEmailVerification.jsx');
    const retailComponentSource = readAppSource('modes/retail/checkout/components/RetailOrderGuestEmailVerification.jsx');
    const simpleComponentSource = readAppSource('modes/simple/checkout/components/SimpleCheckoutGuestEmailVerification.jsx');
    const serviceComponentSource = readAppSource('modes/services/booking/components/ServiceBookingGuestEmailVerification.jsx');
    const customerValidationSource = readAppSource('modes/fnb/checkout/model/fnbCheckoutCustomerValidation.js');
    const submissionSource = readAppSource('modes/fnb/checkout/hooks/useFnbCheckoutSubmission.js');
    const sharedSubmissionSource = readAppSource('shared/hooks/useCheckoutSubmission.js');
    const checkoutRouteContainerSource = readAppSource('modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx');
    const simpleCustomerStepSource = readAppSource('modes/simple/checkout/components/SimpleCheckoutCustomerStep.jsx');
    const simpleRoutePropsSource = readAppSource('modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js');
    const serviceValidatorSource = readRepoSource('apps/dgfy-api/src/validators/serviceValidator.js');
    const serviceUseCaseSource = readRepoSource('apps/dgfy-api/src/modules/services/usecases/serviceUseCases.js');
    const submissionCallStart = appSource.indexOf('} = useCheckoutSubmission({');
    const submissionCallEnd = appSource.indexOf('\n  });', submissionCallStart);
    const submissionCallSource = appSource.slice(submissionCallStart, submissionCallEnd);
    expect(modelSource).toContain("/api/v1/store/checkout/guest-otp/request");
    expect(modelSource).toContain("/api/v1/store/checkout/guest-otp/verify");
    expect(hookSource).toContain('idempotency_key');
    expect(modelSource).toContain('RESEND_COOLDOWN_SECONDS = 60');
    expect(hookSource).toContain('RESEND_COOLDOWN_SECONDS');
    expect(hookSource).toContain('guestCheckoutProof');
    expect(hookSource).toContain('emailOverride');
    expect(hookSource).toContain('Email verification could not be completed. Please try again.');
    expect(hookSource).toContain('delivery_status');
    expect(hookSource).toContain('Email verification code could not be delivered. Please try again later.');
    expect(sharedVerificationSource).toContain('Verify your email');
    expect(sharedVerificationSource).toContain('Send again in');
    expect(sharedVerificationSource).toContain('badgeLabel');
    expect(sharedVerificationSource).toContain('resendLabel');
    expect(fnbComponentSource).toContain('badgeLabel="Recommended"');
    expect(fnbComponentSource).toContain('resendLabel="Send code again"');
    expect(retailComponentSource).toContain('Verify your email');
    expect(simpleComponentSource).toContain('Verify your email');
    expect(serviceComponentSource).toContain('badgeLabel="Required"');
    expect(serviceComponentSource).toContain('resendLabel="Send verification code"');
    expect(appSource).not.toContain('shared/components/checkout/GuestEmailVerification.jsx');
    expect(customerValidationSource).toContain('isValidFnbCheckoutEmail');
    expect(customerValidationSource).toContain('isValidPhilippineMobileNumber');
    expect(submissionSource).toContain('guest_checkout_proof');
    expect(submissionSource).toContain('guestCheckoutIntentId');
    expect(appSource).toContain("import { useGuestCheckoutOtp } from './shared/checkout/hooks/useGuestCheckoutOtp.js';");
    expect(appSource).toContain('} = useGuestCheckoutOtp({');
    expect(submissionCallSource).toContain('guestCheckoutIntentId');
    expect(submissionCallSource).toContain('guestCheckoutOtpVerified');
    expect(submissionCallSource).toContain('guestCheckoutProof');
    expect(appSource).not.toContain('useFnbGuestCheckoutOtp');
    expect(checkoutRouteContainerSource).toContain('FnbGuestEmailVerification');
    expect(sharedSubmissionSource).toContain('guest_checkout_proof');
    expect(sharedSubmissionSource).toContain('GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE');
    expect(modelSource).toContain('Guest checkout needs a separate 6-digit email code.');
    expect(simpleCustomerStepSource).toContain('SimpleCheckoutGuestEmailVerification');
    expect(simpleRoutePropsSource).toContain('onVerifyGuestCheckoutOtp: handleVerifyGuestCheckoutOtp');
    expect(serviceValidatorSource).toContain('guest_checkout_proof');
    expect(serviceUseCaseSource).toContain('assertGuestCheckoutProof');
  });

  // #613: guestCheckoutIntentId/guestCheckoutOtpVerified/guestCheckoutProof are referenced
  // elsewhere in StorefrontApp.jsx (e.g. the useGuestCheckoutOtp destructure, the
  // useFnbCheckoutSubmission call), so a blanket `appSource.toContain(...)` check would have
  // passed even while the shared `useCheckoutSubmission` call site -- the one Retail and Simple
  // MSME checkout actually submit through -- was silently missing all three, which is exactly
  // how #613 shipped undetected. Assert on the call-site block itself, not just the file.
  it('passes the verified guest checkout proof into the shared useCheckoutSubmission call (#613)', () => {
    const appSource = readAppSource('StorefrontApp.jsx');
    const callSiteMatch = appSource.match(/=\s*useCheckoutSubmission\(\{[\s\S]*?\}\);/);

    expect(callSiteMatch).not.toBeNull();
    const callSite = callSiteMatch[0];
    expect(callSite).toContain('guestCheckoutIntentId');
    expect(callSite).toContain('guestCheckoutOtpVerified');
    expect(callSite).toContain('guestCheckoutProof');
  });
});
