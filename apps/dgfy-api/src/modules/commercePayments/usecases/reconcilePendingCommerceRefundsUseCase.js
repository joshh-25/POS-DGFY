import { reconcileRefundedPaymentState } from './commercePaymentAdminUseCases.js';
import { applyProviderRefundStatus } from './applyProviderRefundStatus.js';
import {
  alertCommerceRefundManualReview,
  alertCommerceRefundStalePending
} from './commerceRefundAlerting.js';

const toTimestamp = (value) => {
  if (value == null || value === '') return NaN;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const numeric = Number(value);
    return numeric < 100000000000 ? numeric * 1000 : numeric;
  }
  return new Date(value).getTime();
};

const getProviderRefunds = (resources = []) => {
  if (Array.isArray(resources)) return resources.map((entry) => entry?.data || entry).filter(Boolean);
  if (Array.isArray(resources?.data)) return resources.data.map((entry) => entry?.data || entry).filter(Boolean);
  return [];
};

const getAttributes = (resource = {}) => resource?.attributes || resource || {};
const isPendingOrCreated = (refund) => ['pending', 'created'].includes(String(refund?.status || '').toLowerCase());

const getMatchingProviderRefunds = async ({
  refund,
  providerRefunds,
  commercePaymentRepository
}) => {
  const createdAt = toTimestamp(refund.created_at);
  const minimumProviderTimestamp = createdAt - 5 * 60 * 1000;
  const matches = [];
  for (const providerRefund of getProviderRefunds(providerRefunds)) {
    const attributes = getAttributes(providerRefund);
    const providerRefundId = String(providerRefund?.id || attributes?.id || '').trim();
    const providerTimestamp = toTimestamp(
      providerRefund?.created_at ?? attributes?.created_at ?? providerRefund?.created ?? attributes?.created
    );
    if (!providerRefundId.startsWith('ref_')) continue;
    if (Number(attributes.amount) !== Number(refund.amount_centavos)) continue;
    if (!Number.isFinite(providerTimestamp) || providerTimestamp < minimumProviderTimestamp) continue;
    if (await commercePaymentRepository.findRefundByProviderId(providerRefundId)) continue;
    matches.push(providerRefund);
  }
  return matches;
};

const linkProviderRefund = async ({ refund, session, providerResource, commercePaymentRepository }) => (
  commercePaymentRepository.runInTransaction(async (transaction) => {
    const current = await commercePaymentRepository.findRefundById(refund.refund_id, { transaction, lock: true });
    if (!current || !isPendingOrCreated(current)) return { linked: false, refund: current };
    if (current.provider_refund_id) return { linked: false, refund: current };
    const providerRefundId = String(providerResource?.id || getAttributes(providerResource)?.id || '').trim();
    const alreadyLinked = await commercePaymentRepository.findRefundByProviderId(providerRefundId, { transaction, lock: true });
    if (alreadyLinked && Number(alreadyLinked.refund_id) !== Number(current.refund_id)) {
      return { linked: false, refund: current };
    }

    const linkedRefund = await commercePaymentRepository.updateRefundById(current.refund_id, {
      provider_refund_id: providerRefundId,
      provider_payload: providerResource
    }, { transaction });
    await commercePaymentRepository.createAuditLog?.({
      user_id: null,
      entity_type: 'CommercePayment',
      entity_id: current.refund_id,
      action: 'UPDATE',
      changes: {
        event: 'commerce_payment_refund_provider_linked',
        payment_session_id: session.public_reference,
        refund_reference: current.public_reference,
        provider_refund_id: providerRefundId
      },
      user_agent: 'PayMongo Commerce Refund Reconciliation'
    }, { transaction });
    return { linked: true, refund: linkedRefund };
  })
);

const markManualReview = async ({
  refund,
  session,
  failureCode,
  failureReason,
  commercePaymentRepository,
  raiseAlert,
  logger
}) => {
  const updated = await commercePaymentRepository.runInTransaction(async (transaction) => {
    const current = await commercePaymentRepository.findRefundById(refund.refund_id, { transaction, lock: true });
    if (!current || !isPendingOrCreated(current)) return current;
    const lockedSession = await commercePaymentRepository.findSessionBySessionId(current.payment_session_id, {
      transaction,
      lock: true
    }) || session;
    const reviewed = await commercePaymentRepository.updateRefundById(current.refund_id, {
      status: 'manual_review_required',
      failure_code: failureCode,
      failure_reason: failureReason
    }, { transaction });
    const updatedSession = await reconcileRefundedPaymentState({
      commercePaymentRepository,
      session: lockedSession,
      transaction
    });
    await commercePaymentRepository.createAuditLog?.({
      user_id: null,
      entity_type: 'CommercePayment',
      entity_id: current.refund_id,
      action: 'UPDATE',
      changes: {
        event: 'commerce_payment_refund_manual_review_required',
        payment_session_id: lockedSession.public_reference,
        refund_reference: current.public_reference,
        failure_code: failureCode,
        failure_reason: failureReason
      },
      user_agent: 'PayMongo Commerce Refund Reconciliation'
    }, { transaction });
    return { refund: reviewed, session: updatedSession };
  });

  if (!updated?.refund) return false;
  await alertCommerceRefundManualReview({
    refund: updated.refund,
    session: updated.session,
    reason: failureReason,
    raiseAlert,
    logger
  });
  return true;
};

export const buildReconcilePendingCommerceRefundsUseCase = ({
  commercePaymentRepository,
  paymongoService,
  raiseAlert = async () => {},
  logger = console,
  batchSize = 50,
  orphanedCreatedMinutes = 10,
  notFoundMinutes = 30,
  pendingAlertHours = () => Number.parseInt(process.env.COMMERCE_REFUND_PENDING_ALERT_HOURS || '24', 10) || 24,
  now = () => new Date(),
  recordSucceededRevenueRefund,
  writeOrderPaymentLedgerEntry,
  updateOrderPaymentLedgerEntryStatus,
  partnerClient
}) => async () => {
  const currentTime = now();
  const pendingCreatedBefore = new Date(currentTime.getTime() - orphanedCreatedMinutes * 60 * 1000);
  const refunds = await commercePaymentRepository.listRefundsForReconciliation({
    pendingCreatedBefore,
    limit: batchSize
  });
  const summary = { checked: 0, promoted: 0, linked: 0, escalated: 0, stale_alerted: 0, errors: [] };

  for (const refund of refunds) {
    summary.checked += 1;
    let session = null;
    try {
      session = await commercePaymentRepository.findSessionBySessionId(refund.payment_session_id);
      if (!session) throw new Error('Refund payment session was not found.');

      let providerResource = null;
      if (refund.provider_refund_id) {
        providerResource = await paymongoService.retrieveRefund(refund.provider_refund_id);
        if (providerResource) {
          const result = await applyProviderRefundStatus({
            refund,
            session,
            providerResource,
            actor: 'commerce_refund_reconciler',
            source: 'paymongo_reconciler',
            deps: {
              commercePaymentRepository,
              logger,
              raiseAlert,
              ...(recordSucceededRevenueRefund ? { recordSucceededRevenueRefund } : {}),
              ...(writeOrderPaymentLedgerEntry ? { writeOrderPaymentLedgerEntry } : {}),
              ...(updateOrderPaymentLedgerEntryStatus ? { updateOrderPaymentLedgerEntryStatus } : {}),
              partnerClient
            }
          });
          if (result.applied && result.status !== 'pending') summary.promoted += 1;
        } else if (currentTime.getTime() - toTimestamp(refund.created_at) >= notFoundMinutes * 60 * 1000) {
          const escalated = await markManualReview({
            refund,
            session,
            failureCode: 'PROVIDER_REFUND_NOT_FOUND',
            failureReason: 'PayMongo no longer returns the linked refund. Confirm the provider record before retrying.',
            commercePaymentRepository,
            raiseAlert,
            logger
          });
          if (escalated) summary.escalated += 1;
        }
      } else {
        const providerRefunds = await paymongoService.listPaymentRefunds(session.provider_payment_id);
        const candidates = await getMatchingProviderRefunds({
          refund,
          providerRefunds,
          commercePaymentRepository
        });
        if (candidates.length === 1) {
          const linked = await linkProviderRefund({
            refund,
            session,
            providerResource: candidates[0],
            commercePaymentRepository
          });
          if (linked.linked) {
            summary.linked += 1;
            providerResource = candidates[0];
            const result = await applyProviderRefundStatus({
              refund: linked.refund,
              session,
              providerResource,
              actor: 'commerce_refund_reconciler',
              source: 'paymongo_reconciler',
              deps: {
                commercePaymentRepository,
                logger,
                raiseAlert,
                ...(recordSucceededRevenueRefund ? { recordSucceededRevenueRefund } : {}),
                ...(writeOrderPaymentLedgerEntry ? { writeOrderPaymentLedgerEntry } : {}),
                ...(updateOrderPaymentLedgerEntryStatus ? { updateOrderPaymentLedgerEntryStatus } : {}),
                partnerClient
              }
            });
            if (result.applied && result.status !== 'pending') summary.promoted += 1;
          }
        } else if (candidates.length > 1) {
          const escalated = await markManualReview({
            refund,
            session,
            failureCode: 'PROVIDER_REFUND_AMBIGUOUS_MATCH',
            failureReason: 'Multiple unlinked PayMongo refunds match this payment and amount. Review provider records before retrying.',
            commercePaymentRepository,
            raiseAlert,
            logger
          });
          if (escalated) summary.escalated += 1;
        } else if (currentTime.getTime() - toTimestamp(refund.created_at) >= notFoundMinutes * 60 * 1000) {
          const escalated = await markManualReview({
            refund,
            session,
            failureCode: 'PROVIDER_REFUND_NOT_FOUND',
            failureReason: 'No matching PayMongo refund was found. Confirm the provider record before retrying.',
            commercePaymentRepository,
            raiseAlert,
            logger
          });
          if (escalated) summary.escalated += 1;
        }
      }

    } catch (error) {
      summary.errors.push({
        refund_reference: refund.public_reference,
        error: error?.message || String(error)
      });
      logger?.warn?.('Commerce refund reconciliation failed for one refund.', {
        refundReference: refund.public_reference,
        error: error?.message || String(error)
      });
    }

    if (session) {
      try {
        const freshRefund = await commercePaymentRepository.findRefundById(refund.refund_id);
        const ageMs = currentTime.getTime() - toTimestamp(refund.created_at);
        const alertHours = Math.max(1, Number(
          typeof pendingAlertHours === 'function' ? pendingAlertHours() : pendingAlertHours
        ) || 24);
        if (freshRefund?.status === 'pending' && ageMs >= alertHours * 60 * 60 * 1000) {
          await alertCommerceRefundStalePending({
            refund: freshRefund,
            session,
            raiseAlert,
            logger
          });
          summary.stale_alerted += 1;
        }
      } catch (error) {
        summary.errors.push({
          refund_reference: refund.public_reference,
          error: error?.message || String(error)
        });
        logger?.warn?.('Commerce refund stale-state check failed for one refund.', {
          refundReference: refund.public_reference,
          error: error?.message || String(error)
        });
      }
    }
  }

  return summary;
};
