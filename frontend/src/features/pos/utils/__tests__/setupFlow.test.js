import { describe, expect, it } from 'vitest';
import {
  POS_TERMINAL_SETUP_STEPS,
  resolvePosSetupReadiness,
  resolveStorefrontSetupReadiness,
  resolveTenantSetupStep
} from '../setupFlow.js';

describe('setupFlow', () => {
  it('requires business name, address, and a protected terminal for POS setup readiness', () => {
    const readiness = resolvePosSetupReadiness({
      pos_business_name: { value: 'DGFY Test Store' },
      pos_address: { value: 'Jaro, Iloilo City' },
      pos_terminal_registry: {
        value: [
          {
            terminal_id: 'COUNTER-01',
            label: 'Front Counter',
            location_id: 1,
            is_active: true,
            is_default: true,
            has_password: true
          }
        ]
      }
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.terminalRegistryReady).toBe(true);
  });

  it('keeps storefront setup incomplete until a contact channel exists', () => {
    expect(resolveStorefrontSetupReadiness({}).ready).toBe(false);
    expect(resolveStorefrontSetupReadiness({
      storefront_phone: { value: '+639171234567' }
    }).ready).toBe(true);
  });

  it('advances tenant setup from onboarding to POS setup to storefront setup', () => {
    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      onboardingState: 'in_progress',
      posSetupReady: false,
      storefrontSetupReady: false
    })).toBe(POS_TERMINAL_SETUP_STEPS.ONBOARDING);

    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      onboardingState: 'completed',
      posSetupReady: false,
      storefrontSetupReady: false
    })).toBe(POS_TERMINAL_SETUP_STEPS.POS_SETUP);

    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      onboardingState: 'completed',
      posSetupReady: true,
      storefrontSetupReady: false
    })).toBe(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP);
  });
});
