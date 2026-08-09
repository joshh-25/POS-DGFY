import {
  DEFAULT_WORKFLOW_MODE,
  normalizeWorkflowMode,
  resolveWorkflowModeFamily
} from './workflowMode.js';

import { resolveItemDefaultsForMode } from './modeItemTaxonomy.js';

// Issue #178 Phase 18: posDefaults/wizardLabels used to live here too, but
// both are now sourced from the server-materialized Store Profile
// (profile.pos_defaults / profile.terminology, via WorkflowModeContext) -
// packages/shared-constants/src/posDefaultsAndTerminology.js is their
// single source of truth. itemDefaults/productDefaults stay here: they
// have no Profile equivalent (the Profile's item_taxonomy block covers a
// different shape - preset keys, not per-field defaults - and
// resolveBusinessModeItemDefaults below already prefers
// resolveItemDefaultsForMode over this registry in practice).
const TEMPLATE_BASE = Object.freeze({
  itemDefaults: Object.freeze({
    category: 'raw_material',
    product_type: null,
    unit_of_measure: 'pcs',
    vat_type: 'vatable',
    max_capacity: 100,
    fifo_enabled: true
  }),
  productDefaults: Object.freeze({
    unit_of_measure: 'units',
    vat_type: 'vatable',
    max_capacity: 1000,
    fifo_enabled: true
  })
});

const createTemplate = (overrides = {}) => ({
  ...TEMPLATE_BASE,
  ...overrides,
  itemDefaults: {
    ...TEMPLATE_BASE.itemDefaults,
    ...(overrides.itemDefaults || {})
  },
  productDefaults: {
    ...TEMPLATE_BASE.productDefaults,
    ...(overrides.productDefaults || {})
  }
});

export const BUSINESS_MODE_TEMPLATE_REGISTRY = Object.freeze({
  retail: createTemplate({
    itemDefaults: { category: 'product', product_type: 'finished_goods', unit_of_measure: 'pcs', max_capacity: 200 }
  }),
  services: createTemplate({
    itemDefaults: { category: 'service', product_type: null, unit_of_measure: 'service', max_capacity: 1, current_stock: 0, fifo_enabled: false },
    productDefaults: { unit_of_measure: 'service', fifo_enabled: false, max_capacity: 1 }
  }),
  manufacturing: createTemplate({
    itemDefaults: { category: 'raw_material', product_type: null, unit_of_measure: 'kg', max_capacity: 300 },
    productDefaults: { unit_of_measure: 'units', max_capacity: 1000 }
  }),
  food_manufacturing: createTemplate({
    itemDefaults: { category: 'raw_material', product_type: null, unit_of_measure: 'kg', max_capacity: 300 },
    productDefaults: { unit_of_measure: 'units', max_capacity: 1000 }
  }),
  fnb: createTemplate({
    itemDefaults: { category: 'product', product_type: 'finished_goods', unit_of_measure: 'serving', max_capacity: 180 },
    productDefaults: { unit_of_measure: 'serving', max_capacity: 500 }
  }),
  hospitality: createTemplate({
    itemDefaults: { category: 'product', product_type: 'finished_goods', unit_of_measure: 'unit', max_capacity: 80 },
    productDefaults: { unit_of_measure: 'unit', max_capacity: 300 }
  }),
  healthcare: createTemplate({
    itemDefaults: { category: 'supplies', unit_of_measure: 'pcs', max_capacity: 250 },
    productDefaults: { unit_of_measure: 'pcs', max_capacity: 500 }
  }),
  ticketing_transport: createTemplate({
    itemDefaults: { category: 'product', product_type: 'finished_goods', unit_of_measure: 'ticket', max_capacity: 1000, fifo_enabled: false },
    productDefaults: { unit_of_measure: 'ticket', max_capacity: 2000, fifo_enabled: false }
  }),
  logistics_distribution: createTemplate({
    itemDefaults: { category: 'supplies', unit_of_measure: 'pcs', max_capacity: 400 },
    productDefaults: { unit_of_measure: 'pcs', max_capacity: 900 }
  }),
  education_institutions: createTemplate({
    itemDefaults: { category: 'supplies', unit_of_measure: 'pcs', max_capacity: 220 },
    productDefaults: { unit_of_measure: 'pcs', max_capacity: 600 }
  }),
  msme: createTemplate({
    itemDefaults: { category: 'supplies', product_type: null, unit_of_measure: 'pcs', max_capacity: 100 },
    productDefaults: { unit_of_measure: 'pcs', max_capacity: 250 }
  })
});

const resolveTemplateKey = (workflowMode) => {
  const normalizedMode = normalizeWorkflowMode(workflowMode);
  if (BUSINESS_MODE_TEMPLATE_REGISTRY[normalizedMode]) {
    return normalizedMode;
  }
  const family = resolveWorkflowModeFamily(normalizedMode);
  return family === 'msme' ? 'msme' : DEFAULT_WORKFLOW_MODE;
};

export const resolveBusinessModeTemplate = (workflowMode) => {
  const key = resolveTemplateKey(workflowMode);
  return BUSINESS_MODE_TEMPLATE_REGISTRY[key] || BUSINESS_MODE_TEMPLATE_REGISTRY[DEFAULT_WORKFLOW_MODE];
};

export const resolveBusinessModeItemDefaults = (workflowMode) => (
  resolveItemDefaultsForMode(workflowMode) || resolveBusinessModeTemplate(workflowMode).itemDefaults
);

export const resolveBusinessModeProductDefaults = (workflowMode) => (
  resolveBusinessModeTemplate(workflowMode).productDefaults
);
