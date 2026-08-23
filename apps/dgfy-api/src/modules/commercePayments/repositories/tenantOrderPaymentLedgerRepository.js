// Phase 144 (#824): the single writer for tenant-side `pos_order_payments` REVERSAL rows --
// `kind: 'refund'` and `kind: 'forfeiture'`. Phase 141 (#822) already writes row 1
// (`kind: 'downpayment'`) from `storeUseCases.js`'s checkout use case; this module is its
// counterpart for everything that reverses or keeps that money.
//
// Why this is not just `storeRepository.createOrderPaymentEntry`: that method resolves its model
// through `dbStore` (async-local tenant request context), which exists on the POS and storefront
// request paths but NOT on the PayMongo webhook path -- a landlord-scoped HTTP request with no
// tenant in scope. Since a refund's terminal status usually arrives via that webhook, the writer
// has to reach the tenant database the explicit way. That cross-database pattern already exists
// in this module (`updateTenantPaymentStatus`, commercePaymentAdminUseCases.js) and is copied
// here rather than reinvented.
//
// Lives in repositories/, not services/: its entire job is finding, creating, and updating rows in
// one table. That is also what the architecture guardrail expects -- `usecaseLayerLeak` flags any
// usecase importing a `/services` path, and adding a brand-new file to that allowlist would be
// introducing an exception rather than putting the code in its right layer.
//
// ADR 0069 clause 8 [default] (carried forward verbatim by ADR 0070) is what these rows exist for:
// "The schema from clause 4 must represent a forfeited-vs-applied distinction on the ledger
// regardless of the toggle's setting." Clause 4b puts refund and forfeiture in their own rows,
// linked back to the original event via `related_pos_order_payment_id`, rather than as a status
// flag on the original row.

import tenantConnector from '../../../utils/TenantConnector.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import logger from '../../../config/logger.js';

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

// `pos_order_payments.amount` is peso DECIMAL(14,4) -- ADR 0069 clause 4a, matching every other
// pos_transaction_* money column. The session speaks integer centavos. This is the conversion
// boundary for this module, the same role `centavosToPeso` plays in storeUseCases.js.
export const centavosToPeso = (value) => round4(Number(value || 0) / 100);

/**
 * Deterministic, collision-free idempotency keys for the two reversal kinds. `pos_order_payments`
 * has a UNIQUE (pos_transaction_id, idempotency_key), so a stable key is what makes a replayed
 * webhook or a double-submitted cancel a no-op instead of a duplicate ledger row.
 *
 * The bare session reference is deliberately NOT reused -- Phase 141 already claimed it for the
 * `kind: 'downpayment'` row (`idempotencyKey: capturedPayment.session_reference`).
 */
export const buildRefundLedgerIdempotencyKey = (refundPublicReference) => (
  String(refundPublicReference || '').trim() || null
);
export const buildForfeitureLedgerIdempotencyKey = (sessionPublicReference) => {
  const reference = String(sessionPublicReference || '').trim();
  return reference ? `${reference}:forfeiture` : null;
};

/**
 * Resolves the tenant-DB PosOrderPayment model for a session's tenant, or null when the tenant
 * cannot be reached. Never throws -- every caller here is best-effort by design (see the module
 * comment on the webhook path).
 */
const resolvePosOrderPaymentModel = async ({ commercePaymentRepository, session }) => {
  const tenant = await commercePaymentRepository.findTenantById(session?.tenant_id);
  if (!tenant) return null;
  const sequelizeInstance = await tenantConnector.getConnection(tenant);
  const tenantModels = getTenantModels(sequelizeInstance);
  return tenantModels?.PosOrderPayment || null;
};

/**
 * True only for a session that actually captured a downpayment. `pos_order_payments` is the
 * downpayment epic's own ledger (#815/#273) -- a plain full-payment order has never had a row in
 * it and must not gain one now, or every pre-downpayment order's ledger becomes retroactively
 * inconsistent (some reversals recorded, no captures).
 */
export const isDownpaymentSession = (session = {}) => (
  session?.capture_kind === 'downpayment' && Boolean(session?.pos_transaction_id)
);

/**
 * Writes one reversal row. Returns:
 *   { written: true, entryId }        -- a new row was created
 *   { written: false, reason: '...' } -- deliberately skipped (not a downpayment session, already
 *                                       recorded, or the tenant was unreachable)
 *
 * Best-effort by contract: a tenant-connection failure is logged and reported, never thrown. The
 * landlord-side refund row and the order's own terminal state are the authoritative records; this
 * ledger is tenant-side evidence layered on top, and losing it must never fail a money operation
 * that already succeeded (ADR 0052's Architecture Boundaries: a provider/cross-database failure
 * cannot roll back the tenant order decision).
 */
export const writeTenantOrderPaymentEntry = async ({
  commercePaymentRepository,
  session,
  kind,
  status = 'successful',
  amountCentavos,
  paymentMethod = null,
  paymentProvider = 'paymongo',
  paymentReference = null,
  providerEventId = null,
  idempotencyKey,
  recordedBy = null
}) => {
  if (!isDownpaymentSession(session)) return { written: false, reason: 'not_a_downpayment_session' };
  if (!idempotencyKey) return { written: false, reason: 'missing_idempotency_key' };

  try {
    const PosOrderPayment = await resolvePosOrderPaymentModel({ commercePaymentRepository, session });
    if (!PosOrderPayment) return { written: false, reason: 'tenant_unreachable' };

    // Short-circuit rather than letting the UNIQUE index throw -- a replayed webhook or a retried
    // cancel is an expected, non-exceptional case here, not an error to surface.
    const existing = await PosOrderPayment.findOne({
      where: {
        pos_transaction_id: session.pos_transaction_id,
        idempotency_key: idempotencyKey
      }
    });
    if (existing) {
      return { written: false, reason: 'already_recorded', entryId: existing.pos_order_payment_id };
    }

    // Link the reversal back to the capture it reverses (ADR 0069 clause 4b). Absent is tolerable
    // -- an order whose downpayment row is missing is already anomalous, and refusing to record
    // the reversal would make that worse, not better.
    const originalEntry = await PosOrderPayment.findOne({
      where: {
        pos_transaction_id: session.pos_transaction_id,
        kind: 'downpayment'
      },
      order: [['pos_order_payment_id', 'ASC']]
    });

    const created = await PosOrderPayment.create({
      pos_transaction_id: session.pos_transaction_id,
      kind,
      status,
      amount: centavosToPeso(amountCentavos),
      payment_method: paymentMethod || session.capture_payment_method || 'gcash',
      payment_provider: paymentProvider,
      provider_event_id: providerEventId,
      payment_reference: paymentReference,
      idempotency_key: idempotencyKey,
      related_pos_order_payment_id: originalEntry?.pos_order_payment_id || null,
      recorded_by: recordedBy,
      // Only a terminal-successful event is "confirmed". A pending refund is recorded as evidence
      // that it was submitted, with confirmed_at left null until the webhook says otherwise.
      confirmed_at: status === 'successful' ? new Date() : null
    });

    return { written: true, entryId: created.pos_order_payment_id };
  } catch (error) {
    logger.error('[TenantOrderPaymentLedger] Failed to write reversal ledger row', {
      tenant_id: session?.tenant_id || null,
      pos_transaction_id: session?.pos_transaction_id || null,
      kind,
      idempotency_key: idempotencyKey,
      error: error?.message || String(error)
    });
    return { written: false, reason: 'write_failed', error: error?.message || String(error) };
  }
};

/**
 * Promotes an already-written reversal row to its terminal status once the provider confirms --
 * the async half of a PayMongo refund (`created` -> `pending` -> webhook). Same best-effort
 * contract as the writer above: never throws, because the caller is a webhook handler and a
 * thrown error there makes PayMongo retry a money event.
 */
export const updateTenantOrderPaymentEntryStatus = async ({
  commercePaymentRepository,
  session,
  idempotencyKey,
  status,
  providerEventId = null
}) => {
  if (!isDownpaymentSession(session)) return { updated: false, reason: 'not_a_downpayment_session' };
  if (!idempotencyKey || !status) return { updated: false, reason: 'missing_arguments' };

  try {
    const PosOrderPayment = await resolvePosOrderPaymentModel({ commercePaymentRepository, session });
    if (!PosOrderPayment) return { updated: false, reason: 'tenant_unreachable' };

    const entry = await PosOrderPayment.findOne({
      where: {
        pos_transaction_id: session.pos_transaction_id,
        idempotency_key: idempotencyKey
      }
    });
    if (!entry) return { updated: false, reason: 'entry_not_found' };
    if (entry.status === status) return { updated: false, reason: 'already_at_status', entryId: entry.pos_order_payment_id };

    await entry.update({
      status,
      confirmed_at: status === 'successful' ? (entry.confirmed_at || new Date()) : entry.confirmed_at,
      ...(providerEventId ? { provider_event_id: providerEventId } : {})
    });

    return { updated: true, entryId: entry.pos_order_payment_id };
  } catch (error) {
    logger.error('[TenantOrderPaymentLedger] Failed to update reversal ledger row status', {
      tenant_id: session?.tenant_id || null,
      pos_transaction_id: session?.pos_transaction_id || null,
      idempotency_key: idempotencyKey,
      status,
      error: error?.message || String(error)
    });
    return { updated: false, reason: 'update_failed', error: error?.message || String(error) };
  }
};

/** Maps a landlord `commerce_payment_refunds.status` onto the tenant ledger's own status enum. */
export const mapRefundStatusToLedgerStatus = (refundStatus) => {
  const normalized = String(refundStatus || '').trim().toLowerCase();
  if (['succeeded', 'success', 'refunded'].includes(normalized)) return 'successful';
  if (['failed', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
  // 'created' and 'pending' are both "submitted, not yet terminal".
  return 'pending';
};
