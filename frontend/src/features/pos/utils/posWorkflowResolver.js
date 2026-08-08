// Single source of truth lives in shared-constants so the Store Profile
// materializer and this terminal resolver can never drift apart.
export {
  POS_WORKFLOW_CONFIGS,
  resolvePosWorkflow
} from '@sieitzz/shared-constants/posWorkflows';
