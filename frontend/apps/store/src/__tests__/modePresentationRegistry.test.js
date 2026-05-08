import { describe, expect, it } from 'vitest';
import { getStorefrontModeAdapter, ModePresentationRegistry } from '../modePresentationRegistry.js';

describe('modePresentationRegistry', () => {
  it('returns services-first copy and pin metadata for services tenants', () => {
    const adapter = getStorefrontModeAdapter({ workflow_mode: 'services' });

    expect(adapter.isServicesMode).toBe(true);
    expect(adapter.catalogHeading).toBe('Book Services');
    expect(adapter.primaryActionLabel).toBe('Book a Service');
    expect(adapter.pin.label).toBe('Services');
  });

  it('falls back to default presentation for other modes', () => {
    const adapter = getStorefrontModeAdapter({ workflow_mode: 'retail' });

    expect(adapter.isServicesMode).toBe(false);
    expect(adapter.catalogHeading).toBe(ModePresentationRegistry.default.catalogHeading);
  });
});
