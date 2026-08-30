import {
  resolveWorkflowModeFamily,
  modeHasCapability
} from '@sieitzz/shared-constants/workflowModes';

export * from '@sieitzz/shared-constants/workflowModes';

export const WORKFLOW_MODE_SELECT_VALUES = Object.freeze([
  'retail',
  'services',
  'laundry',
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

// Nav page -> the workflow-mode capability its backend routes already enforce.
// This pairing is the point: visibility and the API's 403 now derive from the
// same fact, so a page can no longer render for a mode whose API will reject
// it. The previous implementation used hardcoded per-family allow/deny lists
// that covered only 4 of the 10 mode families, so Job Orders and Dispatch
// Orders rendered-then-403'd for retail, healthcare, ticketing_transport,
// logistics_distribution and education_institutions.
//   JobOrders/DispatchOrders -> backend/src/routes/jobOrders.js:14,
//                               backend/src/routes/dispatchOrders.js:17
//   StockMovements           -> backend/src/routes/stockMovements.js:14
//   Services                 -> backend/src/routes/services.js:54
//   Fnb                      -> backend/src/routes/fnb.js:66
//   Hospitality              -> backend/src/routes/hospitality.js:62
export const WORKFLOW_PAGE_CAPABILITIES = Object.freeze({
  JobOrders: 'productionWorkflows',
  DispatchOrders: 'productionWorkflows',
  StockMovements: 'inventory',
  Services: 'services',
  Bookings: 'services',
  Calendar: 'services',
  Providers: 'services',
  Fnb: 'fnbDining',
  Kitchen: 'kitchenQueue',
  Tables: 'tableService',
  Hospitality: 'hospitalityReservations'
});

export const WORKFLOW_ROUTE_CAPABILITIES = Object.freeze({
  '/job-orders': 'productionWorkflows',
  '/dispatch-orders': 'productionWorkflows',
  '/stock-movements': 'inventory',
  '/services': 'services',
  '/services/calendar': 'services',
  '/services/bookings': 'services',
  '/services/providers': 'services',
  '/fnb': 'fnbDining',
  '/fnb/kitchen': 'kitchenQueue',
  '/fnb/tables': 'tableService',
  '/hospitality': 'hospitalityReservations'
});

// Pages hidden for a mode for product reasons rather than capability.
export const MODE_HIDDEN_NAV_PAGES = Object.freeze({
  msme: Object.freeze(['AiChat']),
  fnb: Object.freeze(['Services', 'Bookings', 'Calendar', 'Providers']),
  services: Object.freeze(['Fnb', 'Kitchen', 'Tables'])
});

export const MODE_HIDDEN_ROUTE_PREFIXES = Object.freeze({
  msme: Object.freeze(['/ai-chat']),
  fnb: Object.freeze(['/services']),
  services: Object.freeze(['/fnb'])
});

export const MODE_SENSITIVE_NAV_PAGES = Object.freeze(Array.from(new Set([
  ...Object.keys(WORKFLOW_PAGE_CAPABILITIES),
  ...Object.values(MODE_HIDDEN_NAV_PAGES).flat()
])));

export const isHospitalityWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'hospitality';

export const isWorkflowPageModeSensitive = (pageName) => (
  MODE_SENSITIVE_NAV_PAGES.includes(String(pageName || '').trim())
);

// enabledCapabilities is optional (Phase 6 composed-capability overlay).
// disabledCapabilities is optional too (issue #178 Phase 16/19 subtractive
// overlay). Every pre-Phase-6 caller that omits both keeps checking only
// the base mode's fixed capability list - identical to before.
export const isWorkflowPageVisible = (pageName, workflowMode, enabledCapabilities = [], disabledCapabilities = []) => {
  const normalizedPage = String(pageName || '').trim();
  const capability = WORKFLOW_PAGE_CAPABILITIES[normalizedPage];
  if (capability) return modeHasCapability(workflowMode, capability, enabledCapabilities, disabledCapabilities);
  const hiddenPages = MODE_HIDDEN_NAV_PAGES[resolveWorkflowModeFamily(workflowMode)];
  return !hiddenPages?.includes(normalizedPage);
};

export const isWorkflowPathBlocked = (pathname, workflowMode, enabledCapabilities = [], disabledCapabilities = []) => {
  const normalizedPath = String(pathname || '/').trim().toLowerCase();
  const matchesPrefix = (prefix) => (
    normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  );
  const capabilityEntry = Object.entries(WORKFLOW_ROUTE_CAPABILITIES)
    .find(([prefix]) => matchesPrefix(prefix));
  if (capabilityEntry) return !modeHasCapability(workflowMode, capabilityEntry[1], enabledCapabilities, disabledCapabilities);
  const hiddenPrefixes = MODE_HIDDEN_ROUTE_PREFIXES[resolveWorkflowModeFamily(workflowMode)] || [];
  return hiddenPrefixes.some(matchesPrefix);
};
