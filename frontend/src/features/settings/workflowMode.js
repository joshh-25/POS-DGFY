import {
  resolveWorkflowModeFamily,
  modeHasCapability
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
  Fnb: 'fnbDining',
  Hospitality: 'hospitalityReservations'
});

export const WORKFLOW_ROUTE_CAPABILITIES = Object.freeze({
  '/job-orders': 'productionWorkflows',
  '/dispatch-orders': 'productionWorkflows',
  '/stock-movements': 'inventory',
  '/services': 'services',
  '/fnb': 'fnbDining',
  '/hospitality': 'hospitalityReservations'
});

// Pages hidden for a mode for product reasons rather than capability. AI Chat
// has no workflow capability at all — backend/src/routes/ai.js gates on
// premium subscription, not workflow mode — so hiding it in MSME stays a UI
// preference and is deliberately not modelled as a (dead) capability.
export const MODE_HIDDEN_NAV_PAGES = Object.freeze({
  msme: Object.freeze(['AiChat'])
});

export const MODE_HIDDEN_ROUTE_PREFIXES = Object.freeze({
  msme: Object.freeze(['/ai-chat'])
});

export const MODE_SENSITIVE_NAV_PAGES = Object.freeze(Array.from(new Set([
  ...Object.keys(WORKFLOW_PAGE_CAPABILITIES),
  ...Object.values(MODE_HIDDEN_NAV_PAGES).flat()
])));

export const isHospitalityWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'hospitality';

export const isWorkflowPageModeSensitive = (pageName) => (
  MODE_SENSITIVE_NAV_PAGES.includes(String(pageName || '').trim())
);

export const isWorkflowPageVisible = (pageName, workflowMode) => {
  const normalizedPage = String(pageName || '').trim();
  const capability = WORKFLOW_PAGE_CAPABILITIES[normalizedPage];
  if (capability) return modeHasCapability(workflowMode, capability);
  const hiddenPages = MODE_HIDDEN_NAV_PAGES[resolveWorkflowModeFamily(workflowMode)];
  return !hiddenPages?.includes(normalizedPage);
};

export const isWorkflowPathBlocked = (pathname, workflowMode) => {
  const normalizedPath = String(pathname || '/').trim().toLowerCase();
  const matchesPrefix = (prefix) => (
    normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  );
  const capabilityEntry = Object.entries(WORKFLOW_ROUTE_CAPABILITIES)
    .find(([prefix]) => matchesPrefix(prefix));
  if (capabilityEntry) return !modeHasCapability(workflowMode, capabilityEntry[1]);
  const hiddenPrefixes = MODE_HIDDEN_ROUTE_PREFIXES[resolveWorkflowModeFamily(workflowMode)] || [];
  return hiddenPrefixes.some(matchesPrefix);
};
