import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKFLOW_MODE,
  getWorkflowModeLabel,
  getWorkflowModePinMeta,
  isWorkflowPageModeSensitive,
  isWorkflowPageVisible,
  isWorkflowPathBlocked,
  modeHasCapability,
  normalizeWorkflowMode,
  WORKFLOW_MODE_SELECT_VALUES,
  TEMPLATE_AUTHORABLE_MODES,
  WORKFLOW_MODE_LABELS
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

  it('keeps the legacy manufacturing alias out of selectable business modes', () => {
    expect(WORKFLOW_MODE_SELECT_VALUES).not.toContain('manufacturing');
    expect(WORKFLOW_MODE_SELECT_VALUES).toContain('food_manufacturing');
    expect(WORKFLOW_MODE_SELECT_VALUES).toContain('fnb');
  });

  // issue #178 final-touch pass: TEMPLATE_AUTHORABLE_MODES is what the admin
  // Store Template curation UI's base-mode dropdown offers - narrower than
  // WORKFLOW_MODE_SELECT_VALUES (which still lists external-engine modes for
  // registration purposes).
  it('excludes the manufacturing alias and every external-engine mode from TEMPLATE_AUTHORABLE_MODES, but keeps transitional modes authorable', () => {
    expect(TEMPLATE_AUTHORABLE_MODES).not.toContain('manufacturing');
    expect(TEMPLATE_AUTHORABLE_MODES).not.toContain('healthcare');
    expect(TEMPLATE_AUTHORABLE_MODES).not.toContain('ticketing_transport');
    expect(TEMPLATE_AUTHORABLE_MODES).not.toContain('logistics_distribution');
    expect(TEMPLATE_AUTHORABLE_MODES).not.toContain('education_institutions');
    expect(TEMPLATE_AUTHORABLE_MODES).toContain('hospitality');
    expect(TEMPLATE_AUTHORABLE_MODES).toContain('food_manufacturing');

    const labels = TEMPLATE_AUTHORABLE_MODES.map((mode) => WORKFLOW_MODE_LABELS[mode]);
    expect(labels.filter((label) => label === 'Food Manufacturing').length).toBe(1);
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

  it('keeps AI Chat hidden in MSME as a product preference rather than a capability', () => {
    // backend/src/routes/ai.js gates on premium subscription, not workflow
    // mode, so there is deliberately no `aiChat` capability to gate on. This
    // is the only nav page left on the non-capability path.
    expect(modeHasCapability('msme', 'aiChat')).toBe(false);
    expect(modeHasCapability('retail', 'aiChat')).toBe(false);
    expect(isWorkflowPageVisible('AiChat', 'msme')).toBe(false);
    expect(isWorkflowPathBlocked('/ai-chat', 'msme')).toBe(true);
    expect(isWorkflowPageVisible('AiChat', 'retail')).toBe(true);
    expect(isWorkflowPageVisible('AiChat', 'food_manufacturing')).toBe(true);
    expect(isWorkflowPathBlocked('/ai-chat', 'retail')).toBe(false);
    expect(isWorkflowPageModeSensitive('AiChat')).toBe(true);
  });

  it('marks mode-dependent navigation as sensitive until workflow mode resolves', () => {
    expect(isWorkflowPageModeSensitive('JobOrders')).toBe(true);
    expect(isWorkflowPageModeSensitive('DispatchOrders')).toBe(true);
    expect(isWorkflowPageModeSensitive('Fnb')).toBe(true);
    expect(isWorkflowPageModeSensitive('Services')).toBe(true);
    expect(isWorkflowPageModeSensitive('Hospitality')).toBe(true);
    expect(isWorkflowPageModeSensitive('Dashboard')).toBe(false);
    expect(isWorkflowPageModeSensitive('Items')).toBe(false);
  });

  it('keeps Hospitality PMS-native and hides unrelated mode consoles', () => {
    expect(getWorkflowModeLabel('hospitality')).toBe('Hospitality');
    expect(getWorkflowModePinMeta('hospitality').icon).toBe('Hotel');
    expect(modeHasCapability('hospitality', 'hospitalityReservations')).toBe(true);
    expect(modeHasCapability('hospitality', 'hospitalityRooms')).toBe(true);
    expect(modeHasCapability('hospitality', 'hospitalityFolios')).toBe(true);
    expect(modeHasCapability('hospitality', 'productionWorkflows')).toBe(false);
    expect(isWorkflowPageVisible('Hospitality', 'hospitality')).toBe(true);
    expect(isWorkflowPageVisible('Hospitality', 'services')).toBe(false);
    expect(isWorkflowPageVisible('Services', 'hospitality')).toBe(false);
    expect(isWorkflowPageVisible('Fnb', 'hospitality')).toBe(false);
    expect(isWorkflowPageVisible('JobOrders', 'hospitality')).toBe(false);
    expect(isWorkflowPathBlocked('/hospitality', 'retail')).toBe(true);
    expect(isWorkflowPathBlocked('/services', 'hospitality')).toBe(true);
    expect(isWorkflowPathBlocked('/fnb', 'hospitality')).toBe(true);
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
    expect(resolveItemDefaultsForMode('hospitality')).toMatchObject({
      category: 'service',
      unit_of_measure: 'room_night',
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
    expect(isValidUom('room_night')).toBe(true);
    expect(getUomGroup('bottle')).toBe('packaging');
    expect(areCompatible('kg', 'g')).toBe(true);
    expect(areCompatible('serving', 'portion')).toBe(false);
    expect(areCompatible('bottle', 'case')).toBe(false);
  });

  it('filters UOM choices to explicit mode-preset units when provided', () => {
    const menuItemPreset = resolveModeItemTaxonomy('fnb').presets.find((preset) => preset.key === 'menu_item');
    const servicePreset = resolveModeItemTaxonomy('services').presets.find((preset) => preset.key === 'service');
    const roomNightPreset = resolveModeItemTaxonomy('hospitality').presets.find((preset) => preset.key === 'room_night');

    expect(filterUomOptions({
      allowedGroups: menuItemPreset.allowed_uom_groups,
      allowedUnits: menuItemPreset.allowed_uoms
    }).map((option) => option.value)).toEqual(['serving', 'portion']);

    expect(filterUomOptions({
      allowedGroups: servicePreset.allowed_uom_groups,
      allowedUnits: servicePreset.allowed_uoms
    }).map((option) => option.value)).toEqual(['service', 'session', 'booking', 'hour']);

    expect(filterUomOptions({
      allowedGroups: roomNightPreset.allowed_uom_groups,
      allowedUnits: roomNightPreset.allowed_uoms
    }).map((option) => option.value)).toEqual(['booking', 'room_night']);
  });
});
