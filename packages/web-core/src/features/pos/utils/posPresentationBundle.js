export const POS_PRESENTATION_SLOT_OWNERS = Object.freeze({
  SHARED: 'shared',
  FNB: 'fnb',
  SERVICES: 'services',
  COUNTER: 'counter'
});

const SHARED_SLOTS = Object.freeze({
  catalog: POS_PRESENTATION_SLOT_OWNERS.SHARED,
  cart: POS_PRESENTATION_SLOT_OWNERS.SHARED,
  checkout: POS_PRESENTATION_SLOT_OWNERS.SHARED,
  payments: POS_PRESENTATION_SLOT_OWNERS.SHARED,
  discounts: POS_PRESENTATION_SLOT_OWNERS.SHARED,
  receipts: POS_PRESENTATION_SLOT_OWNERS.SHARED,
  shifts: POS_PRESENTATION_SLOT_OWNERS.SHARED,
  hardware: POS_PRESENTATION_SLOT_OWNERS.SHARED
});

const buildPresentationBundle = ({
  key,
  checkoutDetailsOwner,
  checkoutDetailsHeading,
  showCheckoutDetailsHeading = false,
  showParkedSaleControls
}) => Object.freeze({
  key,
  labels: Object.freeze({
    checkoutDetailsHeading,
    showCheckoutDetailsHeading
  }),
  currentSaleActions: Object.freeze({
    showParkedSaleControls
  }),
  slots: Object.freeze({
    ...SHARED_SLOTS,
    checkoutDetails: checkoutDetailsOwner,
    currentSaleActions: key
  })
});

export const POS_PRESENTATION_BUNDLES = Object.freeze({
  fnb: buildPresentationBundle({
    key: 'fnb',
    checkoutDetailsOwner: POS_PRESENTATION_SLOT_OWNERS.FNB,
    checkoutDetailsHeading: 'Order details',
    showParkedSaleControls: true
  }),
  services: buildPresentationBundle({
    key: 'services',
    checkoutDetailsOwner: POS_PRESENTATION_SLOT_OWNERS.SERVICES,
    checkoutDetailsHeading: 'Service details',
    showCheckoutDetailsHeading: true,
    showParkedSaleControls: false
  }),
  counter: buildPresentationBundle({
    key: 'counter',
    checkoutDetailsOwner: POS_PRESENTATION_SLOT_OWNERS.COUNTER,
    checkoutDetailsHeading: 'Order details',
    showParkedSaleControls: true
  })
});

const isResolvedPosWorkflow = (posWorkflow) => (
  Boolean(posWorkflow)
  && typeof posWorkflow === 'object'
  && typeof posWorkflow.mode === 'string'
  && typeof posWorkflow.transactionRecord === 'string'
  && Array.isArray(posWorkflow.allowedMethods)
  && posWorkflow.allowedMethods.length > 0
  && Boolean(posWorkflow.capabilities)
  && typeof posWorkflow.capabilities === 'object'
);

/**
 * Resolves cashier presentation from the already-governed POS workflow.
 * Store Template rows are never read here. Invalid or incomplete input falls
 * back to Counter so presentation cannot accidentally gain F&B or Services
 * controls while profile data is loading or malformed.
 */
export const resolvePosPresentationBundle = (posWorkflow) => {
  if (!isResolvedPosWorkflow(posWorkflow)) {
    return POS_PRESENTATION_BUNDLES.counter;
  }

  if (posWorkflow.mode === 'fnb') {
    return POS_PRESENTATION_BUNDLES.fnb;
  }

  if (posWorkflow.mode === 'services') {
    return POS_PRESENTATION_BUNDLES.services;
  }

  return POS_PRESENTATION_BUNDLES.counter;
};
