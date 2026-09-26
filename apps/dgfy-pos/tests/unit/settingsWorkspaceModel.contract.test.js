import { describe, expect, it } from 'vitest';
import {
  buildSettingsVersionMap,
  buildLocationPayload,
  buildPosSettingsPayload,
  buildStorefrontSettingsPayload,
  buildTerminalRegistryPayload,
  getSettingsWriteFailureMessage,
  hydratePosSettingsForm,
  hydrateStorefrontSettingsForm,
  removeTerminalRegistryEntry,
  validateLocationPayload
} from '../../../../packages/web-core/src/features/pos/utils/settingsWorkspaceModel.js';

describe('shared POS settings workspace model', () => {
  it('hydrates POS settings and preserves the persisted payload contract', () => {
    const hydrated = hydratePosSettingsForm({
      pos_registered_name: { value: ' Registered Co. ' },
      pos_discount_profiles: { value: [{ name: ' Senior', percentage: 10, active: true }] },
      pos_terminal_registry: { value: [{ terminal_id: ' pos-01 ', label: 'Counter', is_active: true, is_default: true }] },
      pos_terminal_registry_mode: { value: 'enforce' },
      pos_best_seller_settings: { value: { enabled: false, daily_top_enabled: true } }
    }, { pettyCashSymbol: 'PHP', pettyCashAmount: 50 });

    expect(hydrated.registeredName).toBe(' Registered Co. ');
    expect(hydrated.discountProfiles).toEqual([{ name: 'Senior', percentage: 10, active: true }]);
    expect(hydrated.terminalRegistryMode).toBe('enforce');
    expect(hydrated.bestSellerAutoTaggingEnabled).toBe(false);
    expect(hydrated.dailyTopBestSellerEnabled).toBe(true);

    const payload = buildPosSettingsPayload({
      ...hydrated,
      registeredName: hydrated.registeredName.trim(),
      terminalRegistry: hydrated.terminalRegistry,
      terminalLocationBindingEnforced: true
    });

    expect(payload.pos_registered_name).toBe('Registered Co.');
    expect(payload.pos_discount_profiles).toEqual([{ name: 'Senior', percentage: 10, active: true }]);
    expect(payload.pos_terminal_registry_mode).toBe('enforce');
    expect(payload.pos_terminal_location_binding_enforced).toBe(true);
  });

  it('rejects duplicate terminal IDs and keeps one default after removal', () => {
    expect(() => buildTerminalRegistryPayload({
      terminalRegistry: [
        { terminal_id: 'POS-01', is_active: true, is_default: true },
        { terminal_id: 'POS-01', is_active: true, is_default: false }
      ],
      terminalRegistryMode: 'warn'
    })).toThrow('Duplicate terminal ID: POS-01');

    expect(removeTerminalRegistryEntry([
      { terminal_id: 'POS-01', is_active: true, is_default: true },
      { terminal_id: 'POS-02', is_active: true, is_default: false }
    ], 0)).toEqual([
      expect.objectContaining({ terminal_id: 'POS-02', is_default: true })
    ]);
  });

  it('hydrates storefront data and builds a normalized payload without legacy promo keys', () => {
    const hydrated = hydrateStorefrontSettingsForm({
      customer_access_mode: { value: 'transaction' },
      storefront_social_links: { value: { facebook: ' https://facebook.example/store ' } },
      storefront_why_choose_us: { value: [' Fast service '] },
      storefront_categories: { value: [' Coffee '] },
      storefront_delivery_partners: { value: ['grab'] },
      storefront_review_summary: { value: { score: 4.8, total_count: 2, star_distribution: { 5: 2 } } },
      storefront_guest_checkout_enabled: { value: false }
    });
    const payload = buildStorefrontSettingsPayload(hydrated);

    expect(payload.customer_access_mode).toBe('transaction');
    expect(payload.storefront_social_links.facebook).toBe('https://facebook.example/store');
    expect(payload.storefront_why_choose_us).toEqual(['Fast service']);
    expect(payload.storefront_categories).toEqual(['Coffee']);
    expect(payload.storefront_delivery_partners).toEqual([{ partner: 'grab', label: '', url: '' }]);
    expect(payload.storefront_guest_checkout_enabled).toBe(false);
    expect(payload).not.toHaveProperty('storefront_promo');
    expect(payload).not.toHaveProperty('storefront_promos');
  });

  it('builds location payloads with the optimistic version and validates required fields', () => {
    const payload = buildLocationPayload({
      name: 'Main',
      address_line: '123 Main St',
      latitude: '10.1',
      longitude: '122.2',
      location_version: '2026-09-15T00:00:00.000Z',
      immediate_fulfillment_enabled: false,
      fulfillment_lead_time_min_days: '2',
      fulfillment_lead_time_max_days: '1'
    }, 7);

    expect(payload.last_known_updated_at).toBe('2026-09-15T00:00:00.000Z');
    expect(validateLocationPayload(payload)).toEqual([
      expect.objectContaining({ field: 'fulfillment_lead_time_max_days' })
    ]);
  });

  it('captures persisted setting versions and gives safe write-failure guidance', () => {
    expect(buildSettingsVersionMap({
      storefront_tagline: { value: 'Fresh', updated_at: '2026-09-15T00:00:00.000Z' },
      pos_terminal_registry: { value: [], updatedAt: new Date('2026-09-15T01:00:00.000Z') },
      missing_version: { value: 'legacy' }
    })).toEqual({
      storefront_tagline: '2026-09-15T00:00:00.000Z',
      pos_terminal_registry: '2026-09-15T01:00:00.000Z'
    });

    expect(getSettingsWriteFailureMessage({
      response: {
        status: 409,
        data: { message: 'The setting changed.' }
      }
    })).toBe('The setting changed.');
    expect(getSettingsWriteFailureMessage({ request: {} })).toContain('device is offline');
  });
});
