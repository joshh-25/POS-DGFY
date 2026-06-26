import { describe, expect, it } from 'vitest';
import {
  buildTenantSetupSearch,
  clearTenantSetupSearch,
  getNextTenantSetupStep,
  getPreviousTenantSetupStep,
  POS_TERMINAL_SETUP_STEPS,
  resolveProfileSetupReadiness,
  resolvePosSetupReadiness,
  resolveStorefrontSetupReadiness,
  resolveTenantSetupStep,
  resolveTenantSetupStepValue,
  resolveTenantSetupViewMode
} from '../setupFlow.js';

describe('setupFlow', () => {
  it('treats registered company name as the profile step completion signal', () => {
    const readiness = resolveProfileSetupReadiness({
      company_name: 'DGFY Test Store'
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.companyName).toBe('DGFY Test Store');
  });

  it('requires a protected terminal with store assignment for POS setup readiness', () => {
    const readiness = resolvePosSetupReadiness({
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

  it('keeps storefront setup incomplete until cover and profile assets exist', () => {
    expect(resolveStorefrontSetupReadiness({}).ready).toBe(false);
    expect(resolveStorefrontSetupReadiness({
      storefront_cover_image_url: { value: 'https://cdn.test/cover.png' },
      storefront_profile_image_url: { value: 'https://cdn.test/icon.png' }
    }).ready).toBe(true);
  });

  it('advances tenant setup from profile to storefront setup to POS setup', () => {
    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      requestedStep: POS_TERMINAL_SETUP_STEPS.PROFILE,
      profileReady: false,
      posSetupReady: false,
      storefrontSetupReady: false
    })).toBe(POS_TERMINAL_SETUP_STEPS.PROFILE);

    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      requestedStep: POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP,
      profileReady: true,
      posSetupReady: false,
      storefrontSetupReady: false
    })).toBe(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP);

    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      requestedStep: POS_TERMINAL_SETUP_STEPS.POS_SETUP,
      profileReady: true,
      posSetupReady: false,
      storefrontSetupReady: true
    })).toBe(POS_TERMINAL_SETUP_STEPS.POS_SETUP);
  });

  it('honors the requested step even when that step is already technically ready', () => {
    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      requestedStep: POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP,
      profileReady: true,
      storefrontSetupReady: true,
      posSetupReady: true
    })).toBe(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP);

    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      requestedStep: POS_TERMINAL_SETUP_STEPS.POS_SETUP,
      profileReady: true,
      storefrontSetupReady: true,
      posSetupReady: true
    })).toBe(POS_TERMINAL_SETUP_STEPS.POS_SETUP);
  });

  it('centralizes onboarding navigation order and settings targets', () => {
    expect(getPreviousTenantSetupStep(POS_TERMINAL_SETUP_STEPS.PROFILE)).toBe('');
    expect(getNextTenantSetupStep(POS_TERMINAL_SETUP_STEPS.PROFILE)).toBe(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP);
    expect(getPreviousTenantSetupStep(POS_TERMINAL_SETUP_STEPS.POS_SETUP)).toBe(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP);
    expect(resolveTenantSetupViewMode(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP)).toBe('settings_storefront');
    expect(resolveTenantSetupViewMode(POS_TERMINAL_SETUP_STEPS.POS_SETUP)).toBe('settings_pos');
  });

  it('centralizes onboarding query creation and cleanup', () => {
    expect(buildTenantSetupSearch('', POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP)).toBe('?setup_flow=tenant_onboarding&setup_step=storefront_setup');
    expect(buildTenantSetupSearch('?foo=bar', POS_TERMINAL_SETUP_STEPS.POS_SETUP)).toBe('?foo=bar&setup_flow=tenant_onboarding&setup_step=pos_setup');
    expect(clearTenantSetupSearch('?foo=bar&setup_flow=tenant_onboarding&setup_step=pos_setup')).toBe('?foo=bar');
    expect(resolveTenantSetupStepValue('unknown')).toBe(POS_TERMINAL_SETUP_STEPS.PROFILE);
  });
});
