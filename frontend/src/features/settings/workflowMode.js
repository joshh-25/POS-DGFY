import {
  resolveWorkflowModeFamily,
  isMsmeWorkflowMode,
  isServicesWorkflowMode,
  isFnbWorkflowMode
} from '@sieitzz/shared-constants/workflowModes';

export * from '@sieitzz/shared-constants/workflowModes';

export const WORKFLOW_MODE_SELECT_VALUES = Object.freeze([
  'retail',
  'services',
  'food_manufacturing',
  'fnb',
  'hospitality',
  'healthcare',
  'ticketing_transport',
  'logistics_distribution',
  'education_institutions',
  'msme'
]);

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

export const FNB_HIDDEN_NAV_PAGES = Object.freeze([
  'JobOrders',
  'DispatchOrders'
]);

export const FNB_HIDDEN_ROUTE_PREFIXES = Object.freeze([
  '/job-orders',
  '/dispatch-orders'
]);

export const HOSPITALITY_HIDDEN_NAV_PAGES = Object.freeze([
  'JobOrders',
  'DispatchOrders',
  'Fnb',
  'Services'
]);

export const HOSPITALITY_HIDDEN_ROUTE_PREFIXES = Object.freeze([
  '/job-orders',
  '/dispatch-orders',
  '/fnb',
  '/services'
]);

export const SERVICES_ONLY_NAV_PAGES = Object.freeze([
  'Services'
]);

export const SERVICES_ONLY_ROUTE_PREFIXES = Object.freeze([
  '/services'
]);

export const FNB_ONLY_NAV_PAGES = Object.freeze([
  'Fnb'
]);

export const FNB_ONLY_ROUTE_PREFIXES = Object.freeze([
  '/fnb'
]);

export const HOSPITALITY_ONLY_NAV_PAGES = Object.freeze([
  'Hospitality'
]);

export const HOSPITALITY_ONLY_ROUTE_PREFIXES = Object.freeze([
  '/hospitality'
]);

export const MODE_SENSITIVE_NAV_PAGES = Object.freeze(Array.from(new Set([
  ...MSME_HIDDEN_NAV_PAGES,
  ...SERVICES_HIDDEN_NAV_PAGES,
  ...FNB_HIDDEN_NAV_PAGES,
  ...HOSPITALITY_HIDDEN_NAV_PAGES,
  ...SERVICES_ONLY_NAV_PAGES,
  ...FNB_ONLY_NAV_PAGES,
  ...HOSPITALITY_ONLY_NAV_PAGES
])));

export const isHospitalityWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'hospitality';

export const isWorkflowPageModeSensitive = (pageName) => (
  MODE_SENSITIVE_NAV_PAGES.includes(String(pageName || '').trim())
);

export const isWorkflowPageVisible = (pageName, workflowMode) => {
  const normalizedPage = String(pageName || '').trim();
  if (SERVICES_ONLY_NAV_PAGES.includes(normalizedPage)) {
    return isServicesWorkflowMode(workflowMode);
  }
  if (FNB_ONLY_NAV_PAGES.includes(normalizedPage)) {
    return isFnbWorkflowMode(workflowMode);
  }
  if (HOSPITALITY_ONLY_NAV_PAGES.includes(normalizedPage)) {
    return isHospitalityWorkflowMode(workflowMode);
  }
  if (isMsmeWorkflowMode(workflowMode)) {
    return !MSME_HIDDEN_NAV_PAGES.includes(normalizedPage);
  }
  if (isServicesWorkflowMode(workflowMode)) {
    return !SERVICES_HIDDEN_NAV_PAGES.includes(normalizedPage);
  }
  if (isFnbWorkflowMode(workflowMode)) {
    return !FNB_HIDDEN_NAV_PAGES.includes(normalizedPage);
  }
  if (isHospitalityWorkflowMode(workflowMode)) {
    return !HOSPITALITY_HIDDEN_NAV_PAGES.includes(normalizedPage);
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
  if (matchesPrefix(FNB_ONLY_ROUTE_PREFIXES)) {
    return !isFnbWorkflowMode(workflowMode);
  }
  if (matchesPrefix(HOSPITALITY_ONLY_ROUTE_PREFIXES)) {
    return !isHospitalityWorkflowMode(workflowMode);
  }
  if (isMsmeWorkflowMode(workflowMode)) return matchesPrefix(MSME_HIDDEN_ROUTE_PREFIXES);
  if (isServicesWorkflowMode(workflowMode)) return matchesPrefix(SERVICES_HIDDEN_ROUTE_PREFIXES);
  if (isFnbWorkflowMode(workflowMode)) return matchesPrefix(FNB_HIDDEN_ROUTE_PREFIXES);
  if (isHospitalityWorkflowMode(workflowMode)) return matchesPrefix(HOSPITALITY_HIDDEN_ROUTE_PREFIXES);
  return false;
};
