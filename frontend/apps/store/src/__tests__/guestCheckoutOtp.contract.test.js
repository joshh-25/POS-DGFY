import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../StorefrontApp.jsx'), 'utf8');

describe('Storefront guest checkout OTP contract', () => {
  it('requires guest verification before submitting checkout and preserves the proof in the payload', () => {
    expect(source).toContain("/api/v1/store/checkout/guest-otp/request");
    expect(source).toContain("/api/v1/store/checkout/guest-otp/verify");
    expect(source).toContain('Verify the Gmail code before placing this guest order.');
    expect(source).toContain('guest_checkout_proof: isDgfyCustomerSignedIn ? null : guestCheckoutProof?.proof || null');
    expect(source).toContain('idempotency_key: isDgfyCustomerSignedIn ?');
  });
});
