import { normalizeWorkflowMode } from '@sieitzz/shared-constants/workflowModes';

export * from '@sieitzz/shared-constants/modeItemTaxonomy';

// Which item presets onboarding/POS setup surfaces prefer to show first per
// mode, so a new tenant sees the preset they actually sell rather than every
// preset the mode's taxonomy defines (e.g. an F&B tenant sees "Menu Item",
// not "Ingredient" or "Packaging").
export const ONBOARDING_CUSTOMER_FACING_PRESETS = Object.freeze({
  food_manufacturing: ['finished_product'],
  msme: ['product'],
  services: ['service', 'physical_add_on'],
  fnb: ['menu_item'],
  retail: ['general_merchandise']
});

export const filterCustomerFacingPresets = (workflowMode, presets = []) => {
  const preferredKeys = ONBOARDING_CUSTOMER_FACING_PRESETS[normalizeWorkflowMode(workflowMode)] || [];
  const preferredPresets = (presets || []).filter((preset) => preferredKeys.includes(preset?.key));
  return preferredPresets.length > 0 ? preferredPresets : presets;
};
