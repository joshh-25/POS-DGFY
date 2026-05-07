import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKFLOW_MODE,
  getWorkflowModeLabel,
  getWorkflowModePinMeta,
  isWorkflowPageVisible,
  isWorkflowPathBlocked,
  modeHasCapability,
  normalizeWorkflowMode
} from '../workflowMode.js';
import {
  PLACEHOLDER_ITEM_TAXONOMY_MODES,
  resolveItemDefaultsForMode,
  resolveModeItemTaxonomy
} from '../modeItemTaxonomy.js';
import { areCompatible, filterUomOptions, getUomGroup, isValidUom } from '../../../utils/uomConverter.js';

describe('Services and Food Manufacturing workflow modes', () => {
  it('uses Food Manufacturing as the default and legacy manufacturing alias', () => {
    expect(DEFAULT_WORKFLOW_MODE).toBe('food_manufacturing');
    expect(normalizeWorkflowMode('manufacturing')).toBe('food_manufacturing');
    expect(getWorkflowModeLabel('manufacturing')).toBe('Food Manufacturing');
  });

  it('keeps Services navigation independent from manufacturing workflows', () => {
    expect(modeHasCapability('services', 'services')).toBe(true);
    expect(modeHasCapability('services', 'productionWorkflows')).toBe(false);
    expect(isWorkflowPageVisible('Services', 'services')).toBe(true);
    expect(isWorkflowPageVisible('JobOrders', 'services')).toBe(false);
    expect(isWorkflowPageVisible('Services', 'food_manufacturing')).toBe(false);
  });

  it('uses the planned pin metadata for Services and Food Manufacturing', () => {
    expect(getWorkflowModePinMeta('services').icon).toBe('CalendarCheck');
    expect(getWorkflowModePinMeta('food_manufacturing').icon).toBe('Factory');
  });

  it('keeps Food & Beverage restaurant-native and hides manufacturing production navigation', () => {
    expect(getWorkflowModeLabel('fnb')).toBe('Food & Beverage');
    expect(getWorkflowModePinMeta('fnb').icon).toBe('Utensils');
    expect(modeHasCapability('fnb', 'fnbDining')).toBe(true);
    expect(modeHasCapability('fnb', 'menuModifiers')).toBe(true);
    expect(modeHasCapability('fnb', 'tableService')).toBe(true);
    expect(modeHasCapability('fnb', 'kitchenQueue')).toBe(true);
    expect(modeHasCapability('fnb', 'restaurantServiceCharge')).toBe(true);
    expect(modeHasCapability('fnb', 'productionWorkflows')).toBe(false);
    expect(isWorkflowPageVisible('Fnb', 'fnb')).toBe(true);
    expect(isWorkflowPageVisible('Fnb', 'food_manufacturing')).toBe(false);
    expect(isWorkflowPageVisible('JobOrders', 'fnb')).toBe(false);
    expect(isWorkflowPageVisible('DispatchOrders', 'fnb')).toBe(false);
    expect(isWorkflowPathBlocked('/fnb', 'retail')).toBe(true);
    expect(isWorkflowPathBlocked('/job-orders', 'fnb')).toBe(true);
  });

  it('defines corrected item taxonomy only for governed modes', () => {
    expect(resolveItemDefaultsForMode('fnb')).toMatchObject({
      category: 'product',
      product_type: 'finished_goods',
      unit_of_measure: 'serving',
      fifo_enabled: false
    });
    expect(resolveItemDefaultsForMode('services')).toMatchObject({
      category: 'service',
      unit_of_measure: 'service',
      fifo_enabled: false
    });
    expect(resolveModeItemTaxonomy('food_manufacturing').presets.map((preset) => preset.category)).toContain('raw_material');
    expect(resolveModeItemTaxonomy('msme').presets.map((preset) => preset.category)).toEqual(['product', 'supplies']);
    PLACEHOLDER_ITEM_TAXONOMY_MODES.forEach((mode) => {
      expect(resolveModeItemTaxonomy(mode)).toBeNull();
    });
  });

  it('supports presentation and packaging UOMs without auto-converting them', () => {
    expect(isValidUom('serving')).toBe(true);
    expect(getUomGroup('serving')).toBe('presentation');
    expect(isValidUom('bottle')).toBe(true);
    expect(getUomGroup('bottle')).toBe('packaging');
    expect(areCompatible('kg', 'g')).toBe(true);
    expect(areCompatible('serving', 'portion')).toBe(false);
    expect(areCompatible('bottle', 'case')).toBe(false);
  });

  it('filters UOM choices to explicit mode-preset units when provided', () => {
    const menuItemPreset = resolveModeItemTaxonomy('fnb').presets.find((preset) => preset.key === 'menu_item');
    const servicePreset = resolveModeItemTaxonomy('services').presets.find((preset) => preset.key === 'service');

    expect(filterUomOptions({
      allowedGroups: menuItemPreset.allowed_uom_groups,
      allowedUnits: menuItemPreset.allowed_uoms
    }).map((option) => option.value)).toEqual(['serving', 'portion']);

    expect(filterUomOptions({
      allowedGroups: servicePreset.allowed_uom_groups,
      allowedUnits: servicePreset.allowed_uoms
    }).map((option) => option.value)).toEqual(['service', 'session', 'booking', 'hour']);
  });
});
