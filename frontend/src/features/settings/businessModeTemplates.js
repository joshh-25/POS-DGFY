import {
  DEFAULT_WORKFLOW_MODE,
  normalizeWorkflowMode,
  resolveWorkflowModeFamily
} from './workflowMode.js';

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
  }),
  posDefaults: Object.freeze({
    preferred_order_method: 'takeout',
    preferred_payment_type: 'cash',
    show_online_queue: true
  }),
  wizardLabels: Object.freeze({
    item_create_label: 'Create Item',
    product_create_label: 'Create Product',
    pos_workspace_label: 'POS Terminal'
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
  },
  posDefaults: {
    ...TEMPLATE_BASE.posDefaults,
    ...(overrides.posDefaults || {})
  },
  wizardLabels: {
    ...TEMPLATE_BASE.wizardLabels,
    ...(overrides.wizardLabels || {})
  }
});

export const BUSINESS_MODE_TEMPLATE_REGISTRY = Object.freeze({
  retail: createTemplate({
    itemDefaults: { category: 'product', product_type: 'finished_goods', unit_of_measure: 'pcs', max_capacity: 200 },
    posDefaults: { preferred_order_method: 'takeout' },
    wizardLabels: { item_create_label: 'Create Retail SKU' }
  }),
  services: createTemplate({
    itemDefaults: { category: 'product', product_type: 'finished_goods', unit_of_measure: 'service', max_capacity: 50, fifo_enabled: false },
    productDefaults: { unit_of_measure: 'service', fifo_enabled: false, max_capacity: 50 },
    posDefaults: { preferred_order_method: 'dine_in', show_online_queue: true },
    wizardLabels: { item_create_label: 'Create Service SKU', product_create_label: 'Create Service Bundle' }
  }),
  manufacturing: createTemplate({
    itemDefaults: { category: 'raw_material', product_type: null, unit_of_measure: 'kg', max_capacity: 500 },
    productDefaults: { unit_of_measure: 'units', max_capacity: 1500 },
    posDefaults: { preferred_order_method: 'dine_in' }
  }),
  food_manufacturing: createTemplate({
    itemDefaults: { category: 'raw_material', product_type: null, unit_of_measure: 'kg', max_capacity: 300 },
    productDefaults: { unit_of_measure: 'units', max_capacity: 1000 },
    posDefaults: { preferred_order_method: 'takeout' }
  }),
  fnb: createTemplate({
    itemDefaults: { category: 'product', product_type: 'finished_goods', unit_of_measure: 'serving', max_capacity: 180 },
    productDefaults: { unit_of_measure: 'serving', max_capacity: 500 },
    posDefaults: { preferred_order_method: 'dine_in' },
    wizardLabels: { item_create_label: 'Create Menu Item', product_create_label: 'Create Menu Product' }
  }),
  hospitality: createTemplate({
    itemDefaults: { category: 'product', product_type: 'finished_goods', unit_of_measure: 'unit', max_capacity: 80 },
    productDefaults: { unit_of_measure: 'unit', max_capacity: 300 },
    posDefaults: { preferred_order_method: 'dine_in' },
    wizardLabels: { item_create_label: 'Create Hospitality Item' }
  }),
  healthcare: createTemplate({
    itemDefaults: { category: 'supplies', unit_of_measure: 'pcs', max_capacity: 250 },
    productDefaults: { unit_of_measure: 'pcs', max_capacity: 500 },
    posDefaults: { preferred_order_method: 'takeout' },
    wizardLabels: { item_create_label: 'Create Healthcare SKU' }
  }),
  ticketing_transport: createTemplate({
    itemDefaults: { category: 'product', product_type: 'finished_goods', unit_of_measure: 'ticket', max_capacity: 1000, fifo_enabled: false },
    productDefaults: { unit_of_measure: 'ticket', max_capacity: 2000, fifo_enabled: false },
    posDefaults: { preferred_order_method: 'pickup' },
    wizardLabels: { item_create_label: 'Create Ticket SKU' }
  }),
  logistics_distribution: createTemplate({
    itemDefaults: { category: 'supplies', unit_of_measure: 'pcs', max_capacity: 400 },
    productDefaults: { unit_of_measure: 'pcs', max_capacity: 900 },
    posDefaults: { preferred_order_method: 'delivery' },
    wizardLabels: { item_create_label: 'Create Logistics SKU' }
  }),
  education_institutions: createTemplate({
    itemDefaults: { category: 'supplies', unit_of_measure: 'pcs', max_capacity: 220 },
    productDefaults: { unit_of_measure: 'pcs', max_capacity: 600 },
    posDefaults: { preferred_order_method: 'takeout' },
    wizardLabels: { item_create_label: 'Create Campus SKU' }
  }),
  msme: createTemplate({
    itemDefaults: { category: 'supplies', product_type: null, unit_of_measure: 'pcs', max_capacity: 100 },
    productDefaults: { unit_of_measure: 'pcs', max_capacity: 250 },
    posDefaults: { preferred_order_method: 'takeout', show_online_queue: false },
    wizardLabels: { item_create_label: 'Create Item', product_create_label: 'Create Product' }
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
  resolveBusinessModeTemplate(workflowMode).itemDefaults
);

export const resolveBusinessModeProductDefaults = (workflowMode) => (
  resolveBusinessModeTemplate(workflowMode).productDefaults
);

export const resolveBusinessModePosDefaults = (workflowMode) => (
  resolveBusinessModeTemplate(workflowMode).posDefaults
);

export const resolveBusinessModeWizardLabels = (workflowMode) => (
  resolveBusinessModeTemplate(workflowMode).wizardLabels
);

