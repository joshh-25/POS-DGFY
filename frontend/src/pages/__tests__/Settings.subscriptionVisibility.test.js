import { describe, expect, it } from 'vitest';
import { shouldShowMigrateToPayMongoSection } from '../../utils/subscriptionUi.js';

describe('Settings subscription visibility helpers', () => {
  it('shows migrate section for standard manual tenants when user is master admin', () => {
    const visible = shouldShowMigrateToPayMongoSection({
      company: { plan: 'standard', payment_method: 'manual' },
      isMasterAdmin: true
    });

    expect(visible).toBe(true);
  });

  it('shows migrate section for premium manual tenants when user is master admin', () => {
    const visible = shouldShowMigrateToPayMongoSection({
      company: { plan: 'premium', payment_method: 'manual' },
      isMasterAdmin: true
    });

    expect(visible).toBe(true);
  });

  it('hides migrate section for non-master-admin users', () => {
    const visible = shouldShowMigrateToPayMongoSection({
      company: { plan: 'standard', payment_method: 'manual' },
      isMasterAdmin: false
    });

    expect(visible).toBe(false);
  });

  it('hides migrate section when tenant already uses PayMongo', () => {
    const visible = shouldShowMigrateToPayMongoSection({
      company: { plan: 'standard', payment_method: 'paymongo' },
      isMasterAdmin: true
    });

    expect(visible).toBe(false);
  });
});
