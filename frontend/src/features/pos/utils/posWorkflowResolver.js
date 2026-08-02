import { resolveWorkflowModeFamily } from '../../settings/workflowMode.js';

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

export const resolvePosWorkflow = (workflowMode) => {
  if (!workflowMode || typeof workflowMode !== 'string') {
    return POS_WORKFLOW_CONFIGS.default;
  }

  const family = resolveWorkflowModeFamily(workflowMode);

  if (family === 'services') {
    return POS_WORKFLOW_CONFIGS.services;
  }

  if (family === 'fnb' || family === 'hospitality') {
    return POS_WORKFLOW_CONFIGS.fnb;
  }

  // Fallback / default to safe fnb configuration if unspecified or retail/msme for backwards compatibility
  return POS_WORKFLOW_CONFIGS.fnb;
};
