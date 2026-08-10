import { describe, expect, it } from 'vitest';
import {
  BUSINESS_MODE_PIN_META,
  getBusinessModePinMeta,
  normalizeBusinessMode,
  renderBusinessModePinSvg
} from '../discovery/model/businessModePins.js';

describe('business mode storefront pins', () => {
  it('assigns distinct pin icons to service and food manufacturing modes', () => {
    expect(BUSINESS_MODE_PIN_META.services.icon).toBe('CalendarCheck');
    expect(BUSINESS_MODE_PIN_META.food_manufacturing.icon).toBe('Factory');
    expect(BUSINESS_MODE_PIN_META.fnb.label).toBe('Food & Beverage');
    expect(BUSINESS_MODE_PIN_META.fnb.icon).toBe('Utensils');
    expect(getBusinessModePinMeta('manufacturing').label).toBe('Food Manufacturing');
  });

  it('renders an inline svg marker for MapLibre without falling back to a generic dot', () => {
    const html = renderBusinessModePinSvg('services', true);
    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="Services"');
    expect(renderBusinessModePinSvg('fnb', true)).toContain('aria-label="Food & Beverage"');
    expect(normalizeBusinessMode('manufacturing')).toBe('food_manufacturing');
  });
});
