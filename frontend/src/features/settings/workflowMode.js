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

export const DEFAULT_WORKFLOW_MODE = 'manufacturing';

export const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

export const WORKFLOW_MODE_CHANGED_EVENT = 'workflow-mode:changed';

export const WORKFLOW_MODE_LABELS = Object.freeze({
  retail: 'Retail',
  services: 'Services',
  manufacturing: 'Manufacturing',
  food_manufacturing: 'Food Manufacturing',
  fnb: 'F&B',
  hospitality: 'Hospitality',
  healthcare: 'Healthcare',
  ticketing_transport: 'Ticketing & Transport',
  logistics_distribution: 'Logistics & Distribution',
  education_institutions: 'Education & Institutions',
  msme: 'Simple (MSME)'
});

const WORKFLOW_MODE_FAMILY_MAP = Object.freeze({
  retail: 'manufacturing',
  services: 'manufacturing',
  manufacturing: 'manufacturing',
  food_manufacturing: 'manufacturing',
  fnb: 'manufacturing',
  hospitality: 'manufacturing',
  healthcare: 'manufacturing',
  ticketing_transport: 'manufacturing',
  logistics_distribution: 'manufacturing',
  education_institutions: 'manufacturing',
  msme: 'msme'
});

const WORKFLOW_MODE_TEMPLATE_MAP = Object.freeze({
  retail: 'manufacturing',
  services: 'manufacturing',
  manufacturing: 'manufacturing',
  food_manufacturing: 'manufacturing',
  fnb: 'manufacturing',
  hospitality: 'manufacturing',
  healthcare: 'manufacturing',
  ticketing_transport: 'manufacturing',
  logistics_distribution: 'manufacturing',
  education_institutions: 'manufacturing',
  msme: 'msme'
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

export const normalizeWorkflowMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (WORKFLOW_MODE_VALUES.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_WORKFLOW_MODE;
};

export const resolveWorkflowModeFamily = (value) => (
  WORKFLOW_MODE_FAMILY_MAP[normalizeWorkflowMode(value)] || 'manufacturing'
);

export const resolveWorkflowTemplateMode = (value) => (
  WORKFLOW_MODE_TEMPLATE_MAP[normalizeWorkflowMode(value)] || 'manufacturing'
);

export const getWorkflowModeLabel = (value) => (
  WORKFLOW_MODE_LABELS[normalizeWorkflowMode(value)] || WORKFLOW_MODE_LABELS[DEFAULT_WORKFLOW_MODE]
);

export const isMsmeWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'msme';

export const isWorkflowPageVisible = (pageName, workflowMode) => {
  if (!isMsmeWorkflowMode(workflowMode)) return true;
  return !MSME_HIDDEN_NAV_PAGES.includes(String(pageName || '').trim());
};

export const isWorkflowPathBlocked = (pathname, workflowMode) => {
  if (!isMsmeWorkflowMode(workflowMode)) return false;
  const normalizedPath = String(pathname || '/').trim().toLowerCase();
  return MSME_HIDDEN_ROUTE_PREFIXES.some((prefix) => (
    normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  ));
};
