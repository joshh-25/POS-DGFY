import { describe, expect, it } from 'vitest';
import { getStorefrontModeAdapter, ModePresentationRegistry } from '../app/runtime/modePresentationRegistry.js';

describe('modePresentationRegistry', () => {
  it('returns services-first copy and pin metadata for services tenants', () => {
    const adapter = getStorefrontModeAdapter({ workflow_mode: 'services' });

    expect(adapter.isServicesMode).toBe(true);
    expect(adapter.catalogHeading).toBe('Book Services');
    expect(adapter.primaryActionLabel).toBe('Book a Service');
    expect(adapter.pin.label).toBe('Services');
    expect(adapter.sharedSections).toEqual({
      navigation: true,
      hero: true,
      promo: true,
      reviews: true,
      footer: true
    });
    expect(adapter.catalogCardVariant).toBe('service_booking');
    expect(adapter.journeyVariant).toBe('booking');
    expect(adapter.storefrontTemplate.sharedShellVariant).toBe('services_fnb_live_shell');
  });

  it('falls back to default presentation for placeholder-taxonomy modes', () => {
    const adapter = getStorefrontModeAdapter({ workflow_mode: 'healthcare' });

    expect(adapter.isServicesMode).toBe(false);
    expect(adapter.isFnbMode).toBe(false);
    expect(adapter.isRetailMode).toBe(false);
    expect(adapter.catalogHeading).toBe(ModePresentationRegistry.default.catalogHeading);
  });

  it('returns retail-first copy and pin metadata for retail tenants', () => {
    const adapter = getStorefrontModeAdapter({ workflow_mode: 'retail' });

    expect(adapter.isRetailMode).toBe(true);
    expect(adapter.isServicesMode).toBe(false);
    expect(adapter.isFnbMode).toBe(false);
    expect(adapter.catalogHeading).toBe('Shop the Store');
    expect(adapter.primaryActionLabel).toBe('Add to Cart');
    expect(adapter.pin.label).toBe('Retail');
    expect(adapter.catalogCardVariant).toBe('product_simple');
    expect(adapter.journeyVariant).toBe('order');
  });

  it('returns menu-first copy for food and beverage tenants', () => {
    const adapter = getStorefrontModeAdapter({ workflow_mode: 'fnb' });

    expect(adapter.isFnbMode).toBe(true);
    expect(adapter.catalogHeading).toBe('Menu Highlights');
    expect(adapter.primaryActionLabel).toBe('Browse Menu');
    expect(adapter.pin.label).toBe('Food & Beverage');
    expect(adapter.catalogCardVariant).toBe('product_menu');
    expect(adapter.journeyVariant).toBe('order');
    expect(adapter.sectionOrder).toEqual(['navigation', 'hero', 'promo', 'catalog', 'reviews', 'footer']);
  });

  it('returns product-first copy for simple msme tenants', () => {
    const adapter = getStorefrontModeAdapter({ workflow_mode: 'msme' });

    expect(adapter.isSimpleMode).toBe(true);
    expect(adapter.catalogHeading).toBe('Everyday Products');
    expect(adapter.catalogCardVariant).toBe('product_simple');
    expect(adapter.journeyVariant).toBe('order');
    expect(adapter.sharedSections.navigation).toBe(true);
  });

  it('keeps retail theme/copy but unlocks service grouping when the services capability is composed in', () => {
    const adapter = getStorefrontModeAdapter({
      workflow_mode: 'retail',
      enabled_capabilities: ['services']
    });

    expect(adapter.isRetailMode).toBe(true);
    expect(adapter.isServicesMode).toBe(false);
    expect(adapter.catalogHeading).toBe('Shop the Store');
    expect(adapter.hasServicesCapability).toBe(true);
    expect(adapter.supportsServiceGrouping).toBe(true);
  });

  it('does not report the services capability for a retail tenant without the overlay', () => {
    const adapter = getStorefrontModeAdapter({ workflow_mode: 'retail', enabled_capabilities: ['fnbDining'] });

    expect(adapter.hasServicesCapability).toBe(false);
    expect(adapter.supportsServiceGrouping).toBe(false);
  });
});
