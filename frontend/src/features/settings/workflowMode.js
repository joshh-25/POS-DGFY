export const WORKFLOW_MODE_VALUES = Object.freeze([
  'retail',
  'services',
  'manufacturing',
  'food_manufacturing',
  'fnb',
  'hospitality',
  'healthcare',
  'ticketing_transport',
  'logistics_distribution',
  'education_institutions',
  'msme'
]);

export const DEFAULT_WORKFLOW_MODE = 'food_manufacturing';

export const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

export const WORKFLOW_MODE_CHANGED_EVENT = 'workflow-mode:changed';

export const WORKFLOW_MODE_LABELS = Object.freeze({
  retail: 'Retail',
  services: 'Services',
  manufacturing: 'Food Manufacturing',
  food_manufacturing: 'Food Manufacturing',
  fnb: 'F&B',
  hospitality: 'Hospitality',
  healthcare: 'Healthcare',
  ticketing_transport: 'Ticketing & Transport',
  logistics_distribution: 'Logistics & Distribution',
  education_institutions: 'Education & Institutions',
  msme: 'Simple (MSME)'
});

export const WORKFLOW_MODE_ALIASES = Object.freeze({
  manufacturing: 'food_manufacturing'
});

const WORKFLOW_MODE_FAMILY_MAP = Object.freeze({
  retail: 'retail',
  services: 'services',
  manufacturing: 'food_manufacturing',
  food_manufacturing: 'food_manufacturing',
  fnb: 'fnb',
  hospitality: 'hospitality',
  healthcare: 'healthcare',
  ticketing_transport: 'ticketing_transport',
  logistics_distribution: 'logistics_distribution',
  education_institutions: 'education_institutions',
  msme: 'msme'
});

const WORKFLOW_MODE_TEMPLATE_MAP = Object.freeze({
  retail: 'retail',
  services: 'services',
  manufacturing: 'food_manufacturing',
  food_manufacturing: 'food_manufacturing',
  fnb: 'fnb',
  hospitality: 'hospitality',
  healthcare: 'healthcare',
  ticketing_transport: 'ticketing_transport',
  logistics_distribution: 'logistics_distribution',
  education_institutions: 'education_institutions',
  msme: 'msme'
});

export const WORKFLOW_MODE_PIN_META = Object.freeze({
  retail: { icon: 'ShoppingBag', label: 'Retail' },
  services: { icon: 'CalendarCheck', label: 'Services' },
  food_manufacturing: { icon: 'Factory', label: 'Food Manufacturing' },
  manufacturing: { icon: 'Factory', label: 'Food Manufacturing' },
  fnb: { icon: 'Utensils', label: 'F&B' },
  hospitality: { icon: 'Hotel', label: 'Hospitality' },
  healthcare: { icon: 'HeartPulse', label: 'Healthcare' },
  ticketing_transport: { icon: 'Ticket', label: 'Ticketing & Transport' },
  logistics_distribution: { icon: 'Truck', label: 'Logistics & Distribution' },
  education_institutions: { icon: 'GraduationCap', label: 'Education & Institutions' },
  msme: { icon: 'Store', label: 'Simple (MSME)' }
});

export const WORKFLOW_MODE_CAPABILITIES = Object.freeze({
  retail: ['catalog', 'inventory', 'pos', 'storefront'],
  services: ['services', 'serviceBookings', 'serviceTickets', 'catalog', 'pos', 'storefront'],
  manufacturing: ['foodManufacturing', 'productionWorkflows', 'inventory', 'pos', 'storefront'],
  food_manufacturing: ['foodManufacturing', 'productionWorkflows', 'inventory', 'pos', 'storefront'],
  fnb: ['catalog', 'inventory', 'pos', 'storefront'],
  hospitality: ['catalog', 'inventory', 'pos', 'storefront'],
  healthcare: ['catalog', 'inventory', 'pos', 'storefront'],
  ticketing_transport: ['catalog', 'inventory', 'pos', 'storefront'],
  logistics_distribution: ['catalog', 'inventory', 'pos', 'storefront'],
  education_institutions: ['catalog', 'inventory', 'pos', 'storefront'],
  msme: ['catalog', 'pos', 'storefront']
});

export const MSME_HIDDEN_NAV_PAGES = Object.freeze([
  'JobOrders',
  'DispatchOrders',
  'StockMovements',
  'AiChat'
]);

export const MSME_HIDDEN_ROUTE_PREFIXES = Object.freeze([
  '/job-orders',
  '/dispatch-orders',
  '/stock-movements',
  '/ai-chat'
]);

export const SERVICES_HIDDEN_NAV_PAGES = Object.freeze([
  'JobOrders',
  'DispatchOrders',
  'StockMovements'
]);

export const SERVICES_HIDDEN_ROUTE_PREFIXES = Object.freeze([
  '/job-orders',
  '/dispatch-orders',
  '/stock-movements'
]);

export const SERVICES_ONLY_NAV_PAGES = Object.freeze([
  'Services'
]);

export const SERVICES_ONLY_ROUTE_PREFIXES = Object.freeze([
  '/services'
]);

export const normalizeWorkflowMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (WORKFLOW_MODE_VALUES.includes(normalized)) {
    return WORKFLOW_MODE_ALIASES[normalized] || normalized;
  }
  return DEFAULT_WORKFLOW_MODE;
};

export const resolveWorkflowModeFamily = (value) => (
  WORKFLOW_MODE_FAMILY_MAP[normalizeWorkflowMode(value)] || DEFAULT_WORKFLOW_MODE
);

export const resolveWorkflowTemplateMode = (value) => (
  WORKFLOW_MODE_TEMPLATE_MAP[normalizeWorkflowMode(value)] || DEFAULT_WORKFLOW_MODE
);

export const getWorkflowModeLabel = (value) => (
  WORKFLOW_MODE_LABELS[normalizeWorkflowMode(value)] || WORKFLOW_MODE_LABELS[DEFAULT_WORKFLOW_MODE]
);

export const isMsmeWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'msme';
export const isServicesWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'services';

export const getWorkflowModePinMeta = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  const mode = WORKFLOW_MODE_VALUES.includes(raw) ? raw : normalizeWorkflowMode(value);
  return WORKFLOW_MODE_PIN_META[mode] || WORKFLOW_MODE_PIN_META[DEFAULT_WORKFLOW_MODE];
};

export const modeHasCapability = (value, capability) => {
  const mode = normalizeWorkflowMode(value);
  const capabilities = WORKFLOW_MODE_CAPABILITIES[mode] || [];
  return capabilities.includes(String(capability || '').trim());
};

export const isWorkflowPageVisible = (pageName, workflowMode) => {
  const normalizedPage = String(pageName || '').trim();
  if (SERVICES_ONLY_NAV_PAGES.includes(normalizedPage)) {
    return isServicesWorkflowMode(workflowMode);
  }
  if (isMsmeWorkflowMode(workflowMode)) {
    return !MSME_HIDDEN_NAV_PAGES.includes(normalizedPage);
  }
  if (isServicesWorkflowMode(workflowMode)) {
    return !SERVICES_HIDDEN_NAV_PAGES.includes(normalizedPage);
  }
  return true;
};

export const isWorkflowPathBlocked = (pathname, workflowMode) => {
  const normalizedPath = String(pathname || '/').trim().toLowerCase();
  const matchesPrefix = (prefixes) => prefixes.some((prefix) => (
    normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  ));
  if (matchesPrefix(SERVICES_ONLY_ROUTE_PREFIXES)) {
    return !isServicesWorkflowMode(workflowMode);
  }
  if (isMsmeWorkflowMode(workflowMode)) return matchesPrefix(MSME_HIDDEN_ROUTE_PREFIXES);
  if (isServicesWorkflowMode(workflowMode)) return matchesPrefix(SERVICES_HIDDEN_ROUTE_PREFIXES);
  return false;
};
