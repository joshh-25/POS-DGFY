export const WORKFLOW_SETTINGS_REQUIRED_MESSAGE = "Store settings haven't loaded. Reconnect to continue.";

export const shouldBlockNewCheckout = ({
  workflowUnresolved = false,
  hasFnbCheckoutContext = false,
  isExistingDineInCheckout = false
} = {}) => Boolean(workflowUnresolved)
  && !hasFnbCheckoutContext
  && !isExistingDineInCheckout;
