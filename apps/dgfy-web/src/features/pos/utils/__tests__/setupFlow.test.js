import { describe, expect, it } from 'vitest';
import {
  buildTenantSetupSearch,
  clearTenantSetupSearch,
  getNextTenantSetupStep,
  getPreviousTenantSetupStep,
  POS_TERMINAL_SETUP_STEPS,
  resolveProfileSetupReadiness,
  resolvePosSetupReadiness,
  resolveStarterItemSetupReadiness,
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
            pairing_version: 'pairing-v1'
          }
        ]
      }
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.terminalRegistryReady).toBe(true);
  });

  it('keeps POS setup incomplete until an active cashier exists when users are checked', () => {
    const settings = {
      pos_terminal_registry: {
        value: [{
          terminal_id: 'COUNTER-01',
          location_id: 1,
          is_active: true,
          pairing_version: 'pairing-v1'
        }]
      }
    };

    expect(resolvePosSetupReadiness(settings, [{ role: 'admin', is_active: true }])).toEqual({
      ready: false,
      terminalRegistryReady: true,
      cashierReady: false
    });
    expect(resolvePosSetupReadiness(settings, [{ role: 'admin', is_master_admin: true, is_active: true }]).ready).toBe(true);
    expect(resolvePosSetupReadiness(settings, [{ role: 'cashier', is_active: true }]).ready).toBe(true);
    expect(resolvePosSetupReadiness(settings, [{ role: 'cashier', is_active: false }]).ready).toBe(false);
  });

  it('keeps storefront setup incomplete until cover and profile assets exist', () => {
    expect(resolveStorefrontSetupReadiness({}).ready).toBe(false);
    expect(resolveStorefrontSetupReadiness({
      storefront_cover_image_url: { value: 'https://cdn.test/cover.png' },
      storefront_profile_image_url: { value: 'https://cdn.test/icon.png' }
    }).ready).toBe(true);
  });

  it('requires an active primary map location when locations are checked', () => {
    const settings = {
      storefront_cover_image_url: { value: 'https://cdn.test/cover.png' },
      storefront_profile_image_url: { value: 'https://cdn.test/icon.png' }
    };

    expect(resolveStorefrontSetupReadiness(settings, []).ready).toBe(false);
    expect(resolveStorefrontSetupReadiness(settings, [{
      location_id: 11,
      address_line: 'Invalid empty coordinates',
      latitude: '',
      longitude: null,
      is_active: true,
      is_primary_storefront: true
    }]).ready).toBe(false);
    expect(resolveStorefrontSetupReadiness(settings, [{
      location_id: 12,
      address_line: 'Iloilo City, Western Visayas',
      latitude: 10.7202,
      longitude: 122.5621,
      is_active: true,
      is_primary_storefront: true
    }])).toEqual(expect.objectContaining({
      ready: true,
      locationReady: true,
      primaryLocationId: 12
    }));
  });

  it('advances tenant setup from profile to storefront setup to POS setup without a starter-item gate', () => {
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
      storefrontSetupReady: true,
      starterItemReady: false
    })).toBe(POS_TERMINAL_SETUP_STEPS.POS_SETUP);

    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      requestedStep: POS_TERMINAL_SETUP_STEPS.POS_SETUP,
      profileReady: true,
      posSetupReady: false,
      storefrontSetupReady: true,
      starterItemReady: true
    })).toBe(POS_TERMINAL_SETUP_STEPS.POS_SETUP);

    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      requestedStep: POS_TERMINAL_SETUP_STEPS.COMPLETE,
      profileReady: true,
      posSetupReady: true,
      storefrontSetupReady: true,
      starterItemReady: false
    })).toBe(POS_TERMINAL_SETUP_STEPS.COMPLETE);
  });

  it('honors the requested step even when that step is already technically ready', () => {
    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      requestedStep: POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP,
      profileReady: true,
      storefrontSetupReady: true,
      starterItemReady: true,
      posSetupReady: true
    })).toBe(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP);

    expect(resolveTenantSetupStep({
      requested: true,
      isMasterAdmin: true,
      requestedStep: POS_TERMINAL_SETUP_STEPS.POS_SETUP,
      profileReady: true,
      storefrontSetupReady: true,
      starterItemReady: true,
      posSetupReady: true
    })).toBe(POS_TERMINAL_SETUP_STEPS.POS_SETUP);
  });

  it('uses a sellable starter item as the POS onboarding starter-item readiness signal', () => {
    expect(resolveStarterItemSetupReadiness([])).toEqual({
      ready: false,
      starterItemReady: false,
      starterItemId: null
    });
    expect(resolveStarterItemSetupReadiness([{
      item_id: 88,
      default_sale_price: 150,
      pos_visible: true,
      status: 'active'
    }])).toEqual({
      ready: true,
      starterItemReady: true,
      starterItemId: 88
    });
  });

  it('centralizes onboarding navigation order and settings targets', () => {
    expect(getPreviousTenantSetupStep(POS_TERMINAL_SETUP_STEPS.PROFILE)).toBe('');
    expect(getNextTenantSetupStep(POS_TERMINAL_SETUP_STEPS.PROFILE)).toBe(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP);
    expect(getPreviousTenantSetupStep(POS_TERMINAL_SETUP_STEPS.POS_SETUP)).toBe(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP);
    expect(getNextTenantSetupStep(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP)).toBe(POS_TERMINAL_SETUP_STEPS.POS_SETUP);
    expect(resolveTenantSetupViewMode(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP)).toBe('settings_storefront');
    expect(resolveTenantSetupViewMode(POS_TERMINAL_SETUP_STEPS.POS_SETUP)).toBe('settings_pos');
    expect(resolveTenantSetupStepValue(POS_TERMINAL_SETUP_STEPS.STARTER_ITEM)).toBe(POS_TERMINAL_SETUP_STEPS.POS_SETUP);
  });

  it('centralizes onboarding query creation and cleanup', () => {
    expect(buildTenantSetupSearch('', POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP)).toBe('?setup_flow=tenant_onboarding&setup_step=storefront_setup');
    expect(buildTenantSetupSearch('?foo=bar', POS_TERMINAL_SETUP_STEPS.POS_SETUP)).toBe('?foo=bar&setup_flow=tenant_onboarding&setup_step=pos_setup');
    expect(buildTenantSetupSearch('', POS_TERMINAL_SETUP_STEPS.COMPLETE)).toBe('?setup_flow=tenant_onboarding&setup_step=complete');
    expect(clearTenantSetupSearch('?foo=bar&setup_flow=tenant_onboarding&setup_step=pos_setup')).toBe('?foo=bar');
    expect(resolveTenantSetupStepValue(POS_TERMINAL_SETUP_STEPS.COMPLETE)).toBe(POS_TERMINAL_SETUP_STEPS.COMPLETE);
    expect(resolveTenantSetupStepValue('unknown')).toBe(POS_TERMINAL_SETUP_STEPS.PROFILE);
  });
});
