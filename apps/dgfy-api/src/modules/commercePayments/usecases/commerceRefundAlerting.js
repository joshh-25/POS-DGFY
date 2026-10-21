import logger from '../../../config/logger.js';

const sendAlert = async ({ raiseAlert = async () => {}, log = logger, payload }) => {
  try {
    return await raiseAlert(payload);
  } catch (error) {
    log?.warn?.('Commerce refund operational alert failed', {
      alertKey: payload?.key,
      error: error?.message
    });
    return null;
  }
};

const getRefundContext = ({ refund = {}, session = {}, nextAction }) => ({
  payment_session_reference: session.public_reference || null,
  refund_reference: refund.public_reference || null,
  tenant_id: session.tenant_id || refund.tenant_id || null,
  amount_centavos: Number(refund.amount_centavos || 0),
  failure_code: refund.failure_code || null,
  failure_reason: refund.failure_reason || null,
  next_action: nextAction
});

export const alertCommerceRefundFailed = async ({
  refund,
  session,
  error = null,
  raiseAlert = async () => {},
  logger: log = logger
}) => {
  const reference = String(refund?.public_reference || refund?.refund_id || 'unknown').trim();
  return sendAlert({
    raiseAlert,
    log,
    payload: {
      key: `paymongo.commerce_refund_failed.${reference}`,
      level: 'error',
      message: `PayMongo commerce refund ${reference} failed. Retry from Admin → Payment Operations.`,
      error: error || (refund?.failure_reason ? new Error(refund.failure_reason) : undefined),
      context: getRefundContext({
        refund,
        session,
        nextAction: 'retry from Admin → Payment Operations'
      })
    }
  });
};

export const alertCommerceRefundManualReview = async ({
  refund,
  session,
  reason,
  raiseAlert = async () => {},
  logger: log = logger
}) => {
  const reference = String(refund?.public_reference || refund?.refund_id || 'unknown').trim();
  return sendAlert({
    raiseAlert,
    log,
    payload: {
      key: `paymongo.commerce_refund_manual_review.${reference}`,
      level: 'error',
      message: `PayMongo commerce refund ${reference} needs administrator review.`,
      error: reason ? new Error(String(reason)) : undefined,
      context: getRefundContext({
        refund,
        session,
        nextAction: 'review in Admin → Payment Operations; retry only after confirming no provider refund exists'
      })
    }
  });
};

export const alertCommerceRefundStalePending = async ({
  refund,
  session,
  raiseAlert = async () => {},
  logger: log = logger
}) => {
  const reference = String(refund?.public_reference || refund?.refund_id || 'unknown').trim();
  return sendAlert({
    raiseAlert,
    log,
    payload: {
      key: `paymongo.commerce_refund_stale_pending.${reference}`,
      level: 'warning',
      message: `PayMongo commerce refund ${reference} is still pending.`,
      context: getRefundContext({
        refund,
        session,
        nextAction: 'check provider status in Admin → Payment Operations'
      }),
      throttleSeconds: 6 * 60 * 60
    }
  });
};
