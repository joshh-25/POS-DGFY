import { describe, expect, it } from 'vitest';
import { resolveReactivatePayPalConfig } from '../../utils/subscriptionUi.js';

describe('Reactivate PayPal fallback configuration', () => {
  it('disables all PayPal configuration when subscriptions are disabled', () => {
    const config = resolveReactivatePayPalConfig({
      plan: 'standard',
      env: {
        VITE_SUBSCRIPTIONS_ENABLED: 'false',
        VITE_PAYPAL_CLIENT_ID: 'client-123',
        VITE_PAYPAL_STANDARD_PLAN_ID: 'P-STANDARD'
      }
    });

    expect(config.canRender).toBe(false);
    expect(config.reason).toContain('Subscription billing is currently disabled');
  });

  it('disables PayPal button when client ID is missing', () => {
    const config = resolveReactivatePayPalConfig({
      plan: 'standard',
      env: {
        VITE_SUBSCRIPTIONS_ENABLED: 'true',
        VITE_PAYPAL_STANDARD_PLAN_ID: 'P-STANDARD'
      }
    });

    expect(config.canRender).toBe(false);
    expect(config.reason).toContain('missing VITE_PAYPAL_CLIENT_ID');
  });

  it('disables PayPal button when selected plan ID is missing', () => {
    const config = resolveReactivatePayPalConfig({
      plan: 'standard',
      env: {
        VITE_SUBSCRIPTIONS_ENABLED: 'true',
        VITE_PAYPAL_CLIENT_ID: 'client-123'
      }
    });

    expect(config.canRender).toBe(false);
    expect(config.reason).toContain('standard plan is not configured');
  });

  it('supports legacy premium fallback env and enables rendering', () => {
    const config = resolveReactivatePayPalConfig({
      plan: 'premium',
      env: {
        VITE_SUBSCRIPTIONS_ENABLED: 'true',
        VITE_PAYPAL_CLIENT_ID: 'client-123',
        VITE_PAYPAL_PLAN_ID: 'P-LEGACY-PREMIUM'
      }
    });

    expect(config.canRender).toBe(true);
    expect(config.planId).toBe('P-LEGACY-PREMIUM');
  });
});
