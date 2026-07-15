import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..', '..', '..');
const readAppSource = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
const readRepoSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Storefront guest checkout OTP contract', () => {
  it('keeps the backend guest OTP endpoints and checkout proof field available', () => {
    const routesSource = readRepoSource('backend/src/routes/store.js');
    const validatorSource = readRepoSource('backend/src/validators/storeValidator.js');

    expect(routesSource).toContain("/checkout/guest-otp/request");
    expect(routesSource).toContain("/checkout/guest-otp/verify");
    expect(validatorSource).toContain('guest_checkout_proof');
  });

  it('owns guest OTP frontend behavior inside the F&B checkout feature boundary', () => {
    const appSource = readAppSource('StorefrontApp.jsx');
    const modelSource = readAppSource('modes/fnb/checkout/model/fnbGuestCheckoutOtp.js');
    const hookSource = readAppSource('modes/fnb/checkout/hooks/useFnbGuestCheckoutOtp.js');
    const componentSource = readAppSource('modes/fnb/checkout/components/FnbGuestEmailVerification.jsx');
    const customerValidationSource = readAppSource('modes/fnb/checkout/model/fnbCheckoutCustomerValidation.js');
    const submissionSource = readAppSource('modes/fnb/checkout/hooks/useFnbCheckoutSubmission.js');

    expect(modelSource).toContain("/api/v1/store/checkout/guest-otp/request");
    expect(modelSource).toContain("/api/v1/store/checkout/guest-otp/verify");
    expect(hookSource).toContain('idempotency_key');
    expect(modelSource).toContain('RESEND_COOLDOWN_SECONDS = 60');
    expect(hookSource).toContain('RESEND_COOLDOWN_SECONDS');
    expect(hookSource).toContain('guestCheckoutProof');
    expect(componentSource).toContain('Verify your email');
    expect(componentSource).toContain('Send code again');
    expect(customerValidationSource).toContain('isValidFnbCheckoutEmail');
    expect(customerValidationSource).toContain('isValidPhilippineMobileNumber');
    expect(submissionSource).toContain('guest_checkout_proof');
    expect(submissionSource).toContain('guestCheckoutIntentId');
    expect(appSource).toContain('useFnbGuestCheckoutOtp');
    expect(appSource).toContain('FnbGuestEmailVerification');
  });
});
