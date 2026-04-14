export const WORKFLOW_MODE_VALUES = Object.freeze(['manufacturing', 'msme']);

export const DEFAULT_WORKFLOW_MODE = 'manufacturing';

export const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

export const WORKFLOW_MODE_CHANGED_EVENT = 'workflow-mode:changed';

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

export const getWorkflowModeLabel = (value) => (
  normalizeWorkflowMode(value) === 'msme' ? 'MSME' : 'Manufacturing'
);

export const isMsmeWorkflowMode = (value) => normalizeWorkflowMode(value) === 'msme';

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
