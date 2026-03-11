import { describe, expect, it } from 'vitest';
import { shouldShowMigrateToPayPalSection } from '../../utils/subscriptionUi.js';

describe('Settings subscription visibility helpers', () => {
  it('shows migrate section for standard manual tenants when user is master admin', () => {
    const visible = shouldShowMigrateToPayPalSection({
      company: { plan: 'standard', payment_method: 'manual' },
      isMasterAdmin: true
    });

    expect(visible).toBe(true);
  });

  it('shows migrate section for premium manual tenants when user is master admin', () => {
    const visible = shouldShowMigrateToPayPalSection({
      company: { plan: 'premium', payment_method: 'manual' },
      isMasterAdmin: true
    });

    expect(visible).toBe(true);
  });

  it('hides migrate section for non-master-admin users', () => {
    const visible = shouldShowMigrateToPayPalSection({
      company: { plan: 'standard', payment_method: 'manual' },
      isMasterAdmin: false
    });

    expect(visible).toBe(false);
  });

  it('hides migrate section when tenant already uses PayPal', () => {
    const visible = shouldShowMigrateToPayPalSection({
      company: { plan: 'standard', payment_method: 'paypal' },
      isMasterAdmin: true
    });

    expect(visible).toBe(false);
  });
});
