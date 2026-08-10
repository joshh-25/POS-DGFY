import { describe, expect, it } from 'vitest';
import {
  buildTenantCapabilityNoticeFromSettings,
  getStorefrontAccessModeMessage
} from '../tenantCapabilityMessages.js';

describe('tenant capability messages', () => {
  it('builds IMS disabled status from settings payloads', () => {
    expect(buildTenantCapabilityNoticeFromSettings({
      tenant_ims_enabled: { value: false }
    })).toMatchObject({
      title: 'Platform admin changed your permissions',
      capability: 'tenant_ims_enabled',
      source: 'settings'
    });
  });

  it('builds POS disabled status from string settings payloads', () => {
    expect(buildTenantCapabilityNoticeFromSettings({
      tenant_ims_enabled: { value: true },
      tenant_pos_enabled: { value: 'false' }
    })).toMatchObject({
      capability: 'tenant_pos_enabled',
      message: expect.stringContaining('POS access is disabled')
    });
  });

  it('builds Storefront map visibility status only when explicitly hidden', () => {
    expect(buildTenantCapabilityNoticeFromSettings({
      tenant_ims_enabled: { value: true },
      tenant_pos_enabled: { value: true },
      store_is_visible: { value: false }
    })).toMatchObject({
      capability: 'store_is_visible',
      message: expect.stringContaining('Storefront and map visibility are disabled')
    });

    expect(buildTenantCapabilityNoticeFromSettings({
      tenant_ims_enabled: { value: true },
      tenant_pos_enabled: { value: true }
    })).toBeNull();
  });

  it('builds Storefront access-mode status for non-ordering modes', () => {
    expect(buildTenantCapabilityNoticeFromSettings({
      tenant_ims_enabled: { value: true },
      tenant_pos_enabled: { value: true },
      store_is_visible: { value: true },
      customer_access_mode: { value: 'catalog' }
    })).toMatchObject({
      code: 'CUSTOMER_ACCESS_MODE_BLOCKED',
      requestedMode: 'catalog',
      effectiveMode: 'catalog',
      message: 'Customers can browse your catalog, but cart, quote, booking, and checkout are disabled.'
    });
  });

  it('keeps Storefront mode copy single-source for known modes', () => {
    expect(getStorefrontAccessModeMessage('ghost')).toBe('Customers can see your store profile, map location, and contact/social links, but catalog and checkout are hidden.');
    expect(getStorefrontAccessModeMessage('catalog')).toBe('Customers can browse your catalog, but cart, quote, booking, and checkout are disabled.');
    expect(getStorefrontAccessModeMessage('inquiry')).toBe('Customers can browse and contact you, but checkout and booking are disabled.');
  });
});
