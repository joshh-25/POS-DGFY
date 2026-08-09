import { resolveWorkflowModeFamily } from './workflowModes.js';

/**
 * POS terminal workflow configs, keyed by selling shape rather than by mode.
 * Single source of truth shared by the admin POS terminal
 * (frontend/src/features/pos/utils/posWorkflowResolver.js re-exports this)
 * and the Store Profile materializer (storeProfile.js), so the profile can
 * never drift from what the terminal actually renders.
 *
 * These are AFFORDANCE configs: they shape the terminal UI only. The backend
 * accepts any method in POS_ORDER_METHODS regardless of workflow.
 */
export const POS_WORKFLOW_CONFIGS = Object.freeze({
  services: Object.freeze({
    mode: 'services',
    transactionRecord: 'booking',
    allowedMethods: Object.freeze(['walk_in', 'appointment']),
    capabilities: Object.freeze({
      tables: false,
      kitchen: false,
      bookings: true,
      providers: true,
      resources: true,
      serviceOptions: true
    })
  }),
  fnb: Object.freeze({
    mode: 'fnb',
    transactionRecord: 'order',
    allowedMethods: Object.freeze(['dine_in', 'takeout', 'pickup', 'delivery']),
    capabilities: Object.freeze({
      tables: true,
      kitchen: true,
      bookings: false,
      providers: false,
      resources: false,
      serviceOptions: false
    })
  }),
  counter: Object.freeze({
    mode: 'counter',
    transactionRecord: 'order',
    allowedMethods: Object.freeze(['walk_in', 'pickup', 'delivery']),
    capabilities: Object.freeze({
      tables: false,
      kitchen: false,
      bookings: false,
      providers: false,
      resources: false,
      serviceOptions: false
    })
  }),
  default: Object.freeze({
    mode: 'fnb',
    transactionRecord: 'order',
    allowedMethods: Object.freeze(['dine_in', 'takeout', 'pickup', 'delivery']),
    capabilities: Object.freeze({
      tables: true,
      kitchen: true,
      bookings: false,
      providers: false,
      resources: false,
      serviceOptions: false
    })
  })
});

// FNB-family capabilities that, when both subtracted, mean a store no
// longer runs the full-service dining floor - it sells over the counter
// instead (issue #178 Phase 21). Neither key exists in hospitality's own
// base capability list (hospitalityRooms/Folios/etc. are a different
// vocabulary), so this check is deliberately scoped to the fnb family only:
// a family-blind version would flip every hospitality tenant to counter
// mode regardless of what it curated, since hospitality never has these
// keys to begin with.
const FNB_DINING_FLOOR_CAPABILITIES = Object.freeze(['tableService', 'kitchenQueue']);

export const resolvePosWorkflow = (workflowMode, effectiveCapabilities = null) => {
  if (!workflowMode || typeof workflowMode !== 'string') {
    return POS_WORKFLOW_CONFIGS.default;
  }

  const family = resolveWorkflowModeFamily(workflowMode);

  if (family === 'services') {
    return POS_WORKFLOW_CONFIGS.services;
  }

  if (family === 'fnb') {
    // A curated store that subtracted both the dining floor capabilities
    // (fnb_counter_service, or any equivalent hand-curated selection) sells
    // over the counter, not full-service - it must not render tables/
    // kitchen affordances its own API 403s. Omitting effectiveCapabilities
    // (the pre-Phase-21 2-arg call) keeps every existing caller on today's
    // exact behavior.
    if (Array.isArray(effectiveCapabilities)) {
      const hasDiningFloor = FNB_DINING_FLOOR_CAPABILITIES.some(
        (capability) => effectiveCapabilities.includes(capability)
      );
      if (!hasDiningFloor) {
        return POS_WORKFLOW_CONFIGS.counter;
      }
    }
    return POS_WORKFLOW_CONFIGS.fnb;
  }

  if (family === 'hospitality') {
    return POS_WORKFLOW_CONFIGS.fnb;
  }

  // Retail, msme, food_manufacturing, and the placeholder modes sell over the
  // counter: no tables, no kitchen, no dine-in default.
  return POS_WORKFLOW_CONFIGS.counter;
};
