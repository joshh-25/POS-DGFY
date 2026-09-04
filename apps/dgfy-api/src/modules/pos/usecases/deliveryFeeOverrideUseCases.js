import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';

// Phase 238 (#1330). Staff delivery-fee override on `pos_transactions.delivery_fee` directly --
// re-sequenced ahead of #237/calculated mode per the epic (#1321): this targets today's flat
// column, not the (not-yet-built) breakdown object. When #237 lands, that ticket's own scope
// extends this mechanism to `delivery.finalFee`; it is not duplicated here.
//
// Phase 281 (#1564). Phase 237 landed the breakdown columns before this file was written, and this
// use case kept writing only the flat `delivery_fee`/`total_amount` -- so an applied override left
// `delivery_fee_override` NULL while breaking `delivery_fee_base - delivery_fee_waiver ===
// delivery_fee`, with nothing in the row to say why. The override amount is now persisted here
// alongside the money it explains.
//
// Design decision, settled in #1564 rather than assumed: this override stays **post-hoc only**. It
// is a correction to an already-persisted transaction, applied after checkout; there is no live
// quote to feed it back into, so `resolveStoreDeliveryFee` (storeUseCases.js) does NOT gain an
// override input. Doing so would also require that resolver to read persisted state, breaking the
// I/O-free, await-free contract its own header and its byte-identity regression tests depend on,
// and would put a second writer on ADR 0078 Decision 4's single storefront choke point. Its
// `overrideAmount: null` is therefore correct, not a stub: at resolve time no override exists yet,
// by definition.

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

// #1564: `delivery_fee_override` is nullable and the null-vs-zero distinction is load-bearing --
// NULL means "no override happened", 0.0000 means "staff set the fee to free". round4() alone
// collapses both to 0 (`Number(null) || 0`), so every read of that column goes through this
// instead. Same null-vs-zero convention PosTransaction.js documents on the column itself.
const round4OrNull = (value) => (
    value === null || value === undefined || value === '' ? null : round4(value)
);

const toSerializable = (value) => (
    value && typeof value.toJSON === 'function' ? value.toJSON() : value
);

// "Unsettled" here means no money has moved yet -- `unpaid` covers both a plain not-yet-paid
// order and a COD order before staff collects cash (COD orders sit in `payment_status: 'unpaid'`
// until collectCashPickupOrder-style collection flips them to `paid`, per
// posUseCases.js's own `hasCollectionEvidence` gate). Every other payment_status --
// `partially_paid` included -- means at least some money has already changed hands, which is
// exactly the refund/top-up territory this ticket states is out of scope. This is deliberately
// narrower than "not yet paid in full".
const UNSETTLED_PAYMENT_STATUS = 'unpaid';

export const buildOverrideDeliveryFeeUseCase = ({ posRepository }) => {
    if (!posRepository) throw new Error('posRepository is required');

    return async ({ posTransactionId, payload = {}, user = {} } = {}) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        const actorUserId = parsePositiveInt(user?.user_id);
        const reason = String(payload?.reason || '').trim();
        const hasDeliveryFeeInput = payload?.delivery_fee !== undefined && payload?.delivery_fee !== null
            && payload?.delivery_fee !== '';
        const requestedDeliveryFee = hasDeliveryFeeInput ? round4(payload.delivery_fee) : null;

        if (!normalizedTransactionId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!actorUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated staff user is required to override the delivery fee',
                { statusCode: 401 }
            ));
        }
        if (reason.length < 3) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'A reason is required to override the delivery fee',
                { statusCode: 422 }
            ));
        }
        if (!hasDeliveryFeeInput || !Number.isFinite(requestedDeliveryFee) || requestedDeliveryFee < 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'delivery_fee must be a non-negative number',
                { statusCode: 422 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();
        try {
            const existing = await posRepository.getTransactionById(normalizedTransactionId, {
                transaction,
                lock: true
            });
            if (!existing) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'POS transaction was not found',
                    { statusCode: 404 }
                );
            }
            if (String(existing.order_method || '').trim().toLowerCase() !== 'delivery') {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'The delivery fee override applies only to delivery orders',
                    {
                        statusCode: 422,
                        details: {
                            reason_code: 'DELIVERY_FEE_OVERRIDE_NOT_A_DELIVERY_ORDER',
                            order_method: existing.order_method || null
                        }
                    }
                );
            }
            if (String(existing.status || '').trim().toLowerCase() === 'voided') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'A voided POS transaction cannot have its delivery fee overridden',
                    { statusCode: 409, details: { reason_code: 'POS_TRANSACTION_VOIDED' } }
                );
            }

            const paymentStatus = String(existing.payment_status || '').trim().toLowerCase();
            if (paymentStatus !== UNSETTLED_PAYMENT_STATUS) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'The delivery fee can be overridden only while payment is unsettled (unpaid, including COD before collection)',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'DELIVERY_FEE_OVERRIDE_PAYMENT_SETTLED',
                            payment_status: paymentStatus || null
                        }
                    }
                );
            }

            const previousDeliveryFee = round4(existing.delivery_fee);
            const previousTotalAmount = round4(existing.total_amount);
            const previousBalanceDue = round4(existing.balance_due);
            const previousAmountPaid = round4(existing.amount_paid);
            // #1564: NULL here means "no staff override has ever been recorded on this order",
            // which is exactly the state Phase 238 left behind on every override it applied.
            const previousDeliveryFeeOverride = round4OrNull(existing.delivery_fee_override);
            const newDeliveryFee = requestedDeliveryFee;
            // The override IS the requested absolute fee -- this endpoint takes a target, never a
            // delta (see the no-op comment below), so provenance and money are the same number by
            // construction rather than by a second, driftable computation.
            const newDeliveryFeeOverride = newDeliveryFee;

            // Re-saving the same value is a no-op -- mirrors applyWorkflowModeAuditLog's own
            // "a no-op write logs nothing" convention (settings audit trail, #234/#1327). No DB
            // write, no audit row, but still a success response so a retried request is idempotent
            // by construction (the client always sends the absolute target fee, never a delta).
            //
            // #1564 narrows this: the money matching is no longer sufficient on its own, because
            // `delivery_fee_override` is part of the state this endpoint owns. A row whose
            // delivery_fee already equals the target but whose override column is still NULL is
            // NOT at the target state -- it is either an order the formula happened to price at
            // this exact number, or (the case that matters) a row written by the pre-#1564 code
            // that applied an override and never recorded it. Both are repaired by falling through
            // to the write below, which changes no money at all (feeDelta === 0) and only stamps
            // provenance. Retry idempotency is preserved exactly: once the write lands, the
            // override column equals the fee, so the next identical submit takes this branch.
            // There is no backfill for pre-#1564 rows (ADR 0012's forward-only rule), so this
            // reasoned, audited, staff-initiated path is the only repair route those rows have.
            if (previousDeliveryFee === newDeliveryFee && previousDeliveryFeeOverride === newDeliveryFeeOverride) {
                await transaction.commit();
                return ok({
                    transaction: toSerializable(existing),
                    delivery_fee_override: {
                        previous_delivery_fee: previousDeliveryFee,
                        new_delivery_fee: newDeliveryFee,
                        previous_delivery_fee_override: previousDeliveryFeeOverride,
                        new_delivery_fee_override: previousDeliveryFeeOverride,
                        previous_total_amount: previousTotalAmount,
                        new_total_amount: previousTotalAmount,
                        previous_balance_due: previousBalanceDue,
                        new_balance_due: previousBalanceDue,
                        provenance_only: false,
                        no_op: true
                    }
                });
            }

            const feeDelta = round4(newDeliveryFee - previousDeliveryFee);
            const newTotalAmount = round4(previousTotalAmount + feeDelta);
            if (newTotalAmount < 0) {
                // Only reachable with already-corrupt data (total_amount < delivery_fee) -- clamping
                // that to zero would silently launder corruption into a wrong-but-plausible total.
                // Fail loudly instead.
                throw new DomainError(
                    DomainErrorCode.INTERNAL_ERROR,
                    'Delivery fee override would produce a negative order total',
                    {
                        statusCode: 500,
                        details: { reason_code: 'DELIVERY_FEE_OVERRIDE_NEGATIVE_TOTAL' }
                    }
                );
            }
            // The guard above restricts this whole path to payment_status === 'unpaid', and
            // getTransactionById/posUseCases.js's own writers only ever leave balance_due at 0 for an
            // unpaid order (see the RF-1 finding on PR #1336) -- so re-deriving balance_due from
            // previousAmountPaid on an unpaid order was flipping it from 0 to the full new total. The
            // COD collection path (posUseCases.js buildCollectCashOnlineOrderUseCase) never clears
            // balance_due, so that non-zero value then fails assertDeliveryCompletionReadiness's
            // zero-balance gate forever (posUseCases.js:1511, DELIVERY_BALANCE_DUE_OUTSTANDING) and
            // risks collecting the balance a second time from a customer who already paid COD in cash.
            // Only recompute from previousAmountPaid when a balance was already outstanding; otherwise
            // preserve the 0 an unpaid order must have.
            const newBalanceDue = previousBalanceDue > 0
                ? Math.max(0, round4(newTotalAmount - previousAmountPaid))
                : previousBalanceDue;

            // #1564: `feeDelta === 0` is reachable now that the no-op branch above also requires the
            // provenance column to match -- that is the pre-#1564-row repair case, where the only
            // column that actually changes is delivery_fee_override. total_amount/balance_due are
            // written back at their existing values, which is a no-change write, not a recompute.
            const provenanceOnly = previousDeliveryFee === newDeliveryFee;

            const updated = await posRepository.updateTransactionLifecycle(normalizedTransactionId, {
                delivery_fee: newDeliveryFee,
                // #1564: the missing write this ticket exists for. Without it, `delivery_fee` no
                // longer equals `delivery_fee_base - delivery_fee_waiver` while
                // `delivery_fee_override` still reads NULL -- i.e. the row claims the formula
                // produced a number the formula cannot produce, with nothing in the columns to say
                // an override is the reason. See PosTransaction.js's two-part invariant.
                delivery_fee_override: newDeliveryFeeOverride,
                total_amount: newTotalAmount,
                balance_due: newBalanceDue
            }, { transaction, lock: true });
            if (
                !updated
                || round4(updated.delivery_fee) !== newDeliveryFee
                || round4OrNull(updated.delivery_fee_override) !== newDeliveryFeeOverride
            ) {
                // Both halves are asserted, not just the money one: a persistence layer that
                // silently dropped delivery_fee_override (an unknown attribute, a stale tenant
                // schema missing the Phase 237 column) would otherwise reproduce exactly the
                // provenance gap this ticket fixes, and do it silently.
                throw new DomainError(
                    DomainErrorCode.INTERNAL_ERROR,
                    'POS transaction delivery fee could not be updated',
                    { statusCode: 500 }
                );
            }
            // Re-read with the full include (lines/item, etc.) for the response only -- `updated`
            // above comes from a bare findByPk with no include, same shape gap RF-4 on PR #1336
            // flagged between this branch and the no-op branch's toSerializable(existing).
            const refreshed = await posRepository.getTransactionById(normalizedTransactionId, { transaction });

            // Sibling audit path, not #234's workflow_mode_change_log (settings-only, no
            // transaction_id column -- verified before implementing, see PR description) and not
            // pos_transaction_adjustments (a closed void/refund enum with fields -- tender_type,
            // provider, cash_drawer_event_id -- that don't fit a fee correction). This is the same
            // per-order audit_logs path posRepository.createAuditLog already writes to inside the
            // same DB transaction elsewhere in this module (e.g. COD cash-collection events).
            await posRepository.createAuditLog({
                user_id: actorUserId,
                entity_type: 'pos_transaction',
                entity_id: normalizedTransactionId,
                action: 'UPDATE',
                event_type: 'pos_delivery_fee_overridden',
                // location_id mirrors cashRefundUseCases.js's sibling money-mutation audit row.
                // terminal_id/shift_id are genuinely unavailable here -- this route is a
                // permissioned back-office edit, not routed through requirePairedTerminal (see the
                // comment on overrideDeliveryFee in posHandlers.js) -- so they're written explicitly
                // as null rather than omitted.
                terminal_id: null,
                shift_id: null,
                location_id: existing.location_id ?? null,
                reason,
                changes: {
                    event: 'pos_delivery_fee_overridden',
                    transaction_id: normalizedTransactionId,
                    previous_delivery_fee: previousDeliveryFee,
                    new_delivery_fee: newDeliveryFee,
                    // #1564: the provenance column's own before/after, so the audit trail records
                    // a pre-#1564-row repair (null -> value, no money change) distinguishably from
                    // an ordinary fee change, rather than both looking identical in the log.
                    previous_delivery_fee_override: previousDeliveryFeeOverride,
                    new_delivery_fee_override: newDeliveryFeeOverride,
                    provenance_only: provenanceOnly,
                    previous_total_amount: previousTotalAmount,
                    new_total_amount: newTotalAmount,
                    previous_balance_due: previousBalanceDue,
                    new_balance_due: newBalanceDue,
                    payment_status_at_override: paymentStatus,
                    reason
                }
            }, { transaction });

            await transaction.commit();
            return ok({
                transaction: toSerializable(refreshed) || updated,
                delivery_fee_override: {
                    previous_delivery_fee: previousDeliveryFee,
                    new_delivery_fee: newDeliveryFee,
                    previous_delivery_fee_override: previousDeliveryFeeOverride,
                    new_delivery_fee_override: newDeliveryFeeOverride,
                    previous_total_amount: previousTotalAmount,
                    new_total_amount: newTotalAmount,
                    previous_balance_due: previousBalanceDue,
                    new_balance_due: newBalanceDue,
                    provenance_only: provenanceOnly,
                    no_op: false
                }
            });
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            return fail(mapPosUseCaseError(error, 'Failed to override POS delivery fee'));
        }
    };
};
