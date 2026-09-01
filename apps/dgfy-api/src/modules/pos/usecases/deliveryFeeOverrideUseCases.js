import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';

// Phase 238 (#1330). Staff delivery-fee override on `pos_transactions.delivery_fee` directly --
// re-sequenced ahead of #237/calculated mode per the epic (#1321): this targets today's flat
// column, not the (not-yet-built) breakdown object. When #237 lands, that ticket's own scope
// extends this mechanism to `delivery.finalFee`; it is not duplicated here.

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

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
            const newDeliveryFee = requestedDeliveryFee;

            // Re-saving the same value is a no-op -- mirrors applyWorkflowModeAuditLog's own
            // "a no-op write logs nothing" convention (settings audit trail, #234/#1327). No DB
            // write, no audit row, but still a success response so a retried request is idempotent
            // by construction (the client always sends the absolute target fee, never a delta).
            if (previousDeliveryFee === newDeliveryFee) {
                await transaction.commit();
                return ok({
                    transaction: toSerializable(existing),
                    delivery_fee_override: {
                        previous_delivery_fee: previousDeliveryFee,
                        new_delivery_fee: newDeliveryFee,
                        previous_total_amount: previousTotalAmount,
                        new_total_amount: previousTotalAmount,
                        previous_balance_due: previousBalanceDue,
                        new_balance_due: previousBalanceDue,
                        no_op: true
                    }
                });
            }

            const feeDelta = round4(newDeliveryFee - previousDeliveryFee);
            const newTotalAmount = Math.max(0, round4(previousTotalAmount + feeDelta));
            const newBalanceDue = Math.max(0, round4(newTotalAmount - previousAmountPaid));

            const updated = await posRepository.updateTransactionLifecycle(normalizedTransactionId, {
                delivery_fee: newDeliveryFee,
                total_amount: newTotalAmount,
                balance_due: newBalanceDue
            }, { transaction, lock: true });
            if (!updated || round4(updated.delivery_fee) !== newDeliveryFee) {
                throw new DomainError(
                    DomainErrorCode.INTERNAL_ERROR,
                    'POS transaction delivery fee could not be updated',
                    { statusCode: 500 }
                );
            }

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
                reason,
                changes: {
                    event: 'pos_delivery_fee_overridden',
                    transaction_id: normalizedTransactionId,
                    previous_delivery_fee: previousDeliveryFee,
                    new_delivery_fee: newDeliveryFee,
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
                transaction: updated,
                delivery_fee_override: {
                    previous_delivery_fee: previousDeliveryFee,
                    new_delivery_fee: newDeliveryFee,
                    previous_total_amount: previousTotalAmount,
                    new_total_amount: newTotalAmount,
                    previous_balance_due: previousBalanceDue,
                    new_balance_due: newBalanceDue,
                    no_op: false
                }
            });
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            return fail(mapPosUseCaseError(error, 'Failed to override POS delivery fee'));
        }
    };
};
