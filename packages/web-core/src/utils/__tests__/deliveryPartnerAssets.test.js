import { describe, expect, it } from 'vitest';
import { getDeliveryPartnerBrandColor, getDeliveryPartnerLogo } from '../deliveryPartnerAssets.js';

describe('delivery partner assets', () => {
  it('provides the bundled logo for each supported partner regardless of casing', () => {
    expect(getDeliveryPartnerLogo('Grab')).toBeTruthy();
    expect(getDeliveryPartnerLogo('FOODPANDA')).toBeTruthy();
    expect(getDeliveryPartnerLogo('lalamove')).toBeTruthy();
    expect(getDeliveryPartnerLogo('GRAB')).toBe(getDeliveryPartnerLogo('grab'));
  });

  it('provides the matching brand color for each supported partner', () => {
    expect(getDeliveryPartnerBrandColor('Grab')).toBe('#289245');
    expect(getDeliveryPartnerBrandColor('FOODPANDA')).toBe('#FF2B85');
    expect(getDeliveryPartnerBrandColor('lalamove')).toBe('#F16824');
  });

  it('leaves unsupported or custom partners on the caller fallback', () => {
    expect(getDeliveryPartnerLogo('custom')).toBe('');
    expect(getDeliveryPartnerLogo('')).toBe('');
    expect(getDeliveryPartnerBrandColor('custom')).toBe('');
  });
});
