import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import {
    assertComplianceOperationAllowed,
    COMPLIANCE_OPERATION
} from '../../compliance/index.js';
import dbStore from '../../../utils/dbStore.js';
import { resolvePosVoidFinancialOutcome } from '../domain/posVoidFinancialOutcome.js';
import { assertMobilePosExpectedTransactionState } from '../domain/mobilePosReplayGuard.js';

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const toSerializable = (value) => (
    value && typeof value.toJSON === 'function' ? value.toJSON() : value
);

const hashPayload = (payload) => {
    const stableStringify = (value) => {
        if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
        if (value && typeof value === 'object') {
            return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
        }
        return JSON.stringify(value);
    };

    // The adjustment request hash is intentionally local to this use case so a
    // retry with the same idempotency key cannot change the refund amount,
    // shift, terminal, or reason.
    return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
};

const buildCompletedCashRefundOutcome = (amount) => ({
    internal_void: 'succeeded',
    refund_required: false,
    refund_state: 'completed',
    refund_method: 'cash',
    tender_ownership: 'merchant_owned',
    next_action: 'none',
    reason_code: 'CASH_REFUND_COMPLETED',
    refund_amount: round4(amount),
    currency: 'PHP'
});

const buildTenantComplianceSnapshot = () => {
    const store = dbStore.getStore() || {};
    if (!store.tenantId) {
        throw new DomainError(
            DomainErrorCode.TENANT_CONTEXT_MISSING,
            'Tenant compliance context is required',
            { statusCode: 400 }
        );
    }

    return {
        id: store.tenantId,
        compliance_mode_state: store.tenantComplianceModeState || null,
        compliance_mode_choice_required: store.tenantComplianceModeChoiceRequired === true,
        compliance_profile: store.tenantComplianceProfile || null,
        compliance_policy_version: store.tenantCompliancePolicyVersion || null
    };
};

const assertCashRefundCompliance = async ({ shift, user }) => {
    const tenant = buildTenantComplianceSnapshot();
    const result = await assertComplianceOperationAllowed({
        tenantId: tenant.id,
        tenant,
        operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
        context: {
            terminal_id: shift?.terminal_id || null,
            terminal_action: 'cash_refund'
        },
        actorUser: user
    });

    if (!result.success) throw result.error;
    return result.data.decision;
};

const assertOwnedOpenShift = ({ shift, actorUserId, shiftOwnerUserId = actorUserId, terminalId, locationId }) => {
    if (!shift || String(shift.status || '').toLowerCase() !== 'open') {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'An open cashier shift is required to issue a cash refund',
            { statusCode: 422, details: { reason_code: 'POS_SHIFT_NOT_OPEN' } }
        );
    }
    if (Number(shift.cashier_id) !== shiftOwnerUserId) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only the cashier who owns the open shift can issue the cash refund',
            { statusCode: 403, details: { reason_code: 'POS_REFUND_SHIFT_OWNER_REQUIRED' } }
        );
    }
    if (terminalId && String(shift.terminal_id) !== String(terminalId)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Refund shift terminal does not match the registered POS terminal',
            { statusCode: 422, details: { reason_code: 'POS_REFUND_TERMINAL_MISMATCH' } }
        );
    }
    if (locationId && Number(shift.location_id) !== Number(locationId)) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Refund shift location does not match the registered POS terminal',
            { statusCode: 403, details: { reason_code: 'POS_REFUND_LOCATION_MISMATCH' } }
        );
    }
};

export const buildCashRefundPosTransactionUseCase = ({ posRepository }) => {
    if (!posRepository) throw new Error('posRepository is required');

    return async ({ posTransactionId, payload = {}, user = {} } = {}) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        const actorUserId = parsePositiveInt(user?.user_id);
        const operatorSessionId = parsePositiveInt(user?.operator_session_id);
        const shiftId = parsePositiveInt(payload?.shift_id);
        const terminalId = String(payload?.terminal_id || '').trim().toUpperCase() || null;
        const locationId = parsePositiveInt(payload?.terminal_location_id);
        const reason = String(payload?.reason || '').trim();
        const idempotencyKey = String(payload?.idempotency_key || '').trim();

        if (!normalizedTransactionId || !actorUserId || !shiftId || reason.length < 3 || idempotencyKey.length < 8) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId, shift_id, reason, and idempotency_key are required',
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
                    'POS transaction not found',
                    { statusCode: 404 }
                );
            }
            if (String(existing.status || '').toLowerCase() !== 'voided') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Void the POS transaction before issuing its cash refund',
                    { statusCode: 409 }
                );
            }

            const amount = round4(existing.total_amount);
            if (amount <= 0) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'POS transaction amount must be greater than zero for a cash refund',
                    { statusCode: 409 }
                );
            }
            const requestHash = hashPayload({
                pos_transaction_id: normalizedTransactionId,
                shift_id: shiftId,
                terminal_id: terminalId,
                location_id: locationId,
                amount,
                reason
            });
            const existingAdjustment = await posRepository.findPosTransactionAdjustmentByIdempotencyKey(
                normalizedTransactionId,
                idempotencyKey,
                { transaction, lock: true }
            );
            if (existingAdjustment) {
                if (String(existingAdjustment.request_hash || '') !== requestHash) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'Cash refund idempotency_key was already used with a different request',
                    { statusCode: 409 }
                );
            }
                if (existingAdjustment.adjustment_type !== 'cash_refund') {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'idempotency_key belongs to a different POS adjustment',
                        { statusCode: 409 }
                    );
                }
                const replayedTransaction = await posRepository.getTransactionById(normalizedTransactionId, {
                    transaction
                });
                const replayedDrawerEvent = existingAdjustment.cash_drawer_event_id
                    && typeof posRepository.getCashDrawerEventById === 'function'
                    ? await posRepository.getCashDrawerEventById(existingAdjustment.cash_drawer_event_id, { transaction })
                    : null;
                await transaction.commit();
                return ok({
                    transaction: toSerializable(replayedTransaction),
                    adjustment: existingAdjustment,
                    cash_drawer_event: replayedDrawerEvent,
                    compliance_decision: null,
                    idempotent_replay: true
                });
            }
            assertMobilePosExpectedTransactionState({ transaction: existing, payload, operation: 'cash_refund' });

            const adjustments = typeof posRepository.listPosTransactionAdjustmentsForTransaction === 'function'
                ? await posRepository.listPosTransactionAdjustmentsForTransaction(normalizedTransactionId, { transaction, lock: true })
                : [];
            const completedCashRefund = (Array.isArray(adjustments) ? adjustments : []).find((adjustment) => (
                adjustment.adjustment_type === 'cash_refund'
                && adjustment.status === 'succeeded'
            ));
            if (completedCashRefund) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'A cash refund has already been recorded for this POS transaction',
                    { statusCode: 409 }
                );
            }

            const financialOutcome = resolvePosVoidFinancialOutcome(existing);
            const paymentType = String(existing.payment_type || '').trim().toLowerCase();
            const paymentStatus = String(existing.payment_status || '').trim().toLowerCase();
            let paymentBreakdown = existing.payment_breakdown;
            if (typeof paymentBreakdown === 'string') {
                try {
                    paymentBreakdown = JSON.parse(paymentBreakdown);
                } catch {
                    paymentBreakdown = [];
                }
            }
            paymentBreakdown = Array.isArray(paymentBreakdown) ? paymentBreakdown : [];
            const activePaymentBreakdown = paymentBreakdown.filter((entry) => round4(entry?.amount) > 0);
            const paymentBreakdownTypes = activePaymentBreakdown
                .map((entry) => String(entry?.payment_type || '').trim().toLowerCase())
                .filter(Boolean);

            if (
                paymentType !== 'cash'
                || paymentStatus !== 'paid'
                || activePaymentBreakdown.length > 1
                || paymentBreakdownTypes.some((type) => type !== 'cash')
            ) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'This cash-refund flow supports paid, single-tender cash POS transactions only',
                    {
                        statusCode: 422,
                        details: {
                            reason_code: 'POS_CASH_REFUND_TENDER_UNSUPPORTED',
                            payment_type: paymentType || null,
                            payment_status: paymentStatus || null,
                            next_action: financialOutcome.next_action || 'manual_review'
                        }
                    }
                );
            }

            const shift = await posRepository.getTerminalShiftById(shiftId, {
                transaction,
                lock: true
            });
            assertOwnedOpenShift({
                shift,
                actorUserId,
                shiftOwnerUserId: parsePositiveInt(user?.register_shift_owner_user_id) || actorUserId,
                terminalId,
                locationId
            });
            const complianceDecision = await assertCashRefundCompliance({ shift, user });

            const eventReason = `Cash refund for ${existing.invoice_number || `POS-${normalizedTransactionId}`}: ${reason}`.slice(0, 255);
            const cashDrawerEvent = await posRepository.createCashDrawerEvent({
                pos_terminal_shift_id: shiftId,
                event_type: 'cash_out',
                amount,
                reason: eventReason,
                recorded_by: actorUserId
            }, { transaction });
            if (!cashDrawerEvent?.pos_cash_drawer_event_id) {
                throw new DomainError(
                    DomainErrorCode.INTERNAL_ERROR,
                    'Cash refund drawer evidence could not be recorded',
                    { statusCode: 500 }
                );
            }

            const refundAt = new Date();
            const completedOutcome = buildCompletedCashRefundOutcome(amount);
            const adjustment = await posRepository.createPosTransactionAdjustment({
                adjustment_reference: `POS-CASH-REFUND-${normalizedTransactionId}`,
                pos_transaction_id: normalizedTransactionId,
                original_cashier_id: parsePositiveInt(existing.cashier_id),
                original_shift_id: parsePositiveInt(existing.shift_id),
                original_terminal_id: existing.terminal_id || null,
                original_location_id: parsePositiveInt(existing.location_id),
                actor_user_id: actorUserId,
                actor_shift_id: shiftId,
                actor_terminal_id: terminalId || shift.terminal_id || null,
                actor_location_id: locationId || parsePositiveInt(shift.location_id),
                adjustment_type: 'cash_refund',
                tender_type: 'cash',
                amount,
                currency: 'PHP',
                status: 'succeeded',
                reason,
                idempotency_key: idempotencyKey,
                request_hash: requestHash,
                cash_drawer_event_id: cashDrawerEvent.pos_cash_drawer_event_id,
                completed_at: refundAt,
                metadata: {
                    evidence_scope: 'walk_in_pos_cash_refund',
                    operator_session_id: operatorSessionId,
                    refund_state: 'completed',
                    payment_status_before_refund: paymentStatus,
                    transaction_shift_id: parsePositiveInt(existing.shift_id),
                    actor_shift_id: shiftId,
                    financial_outcome: completedOutcome,
                    provider_action: 'none'
                }
            }, { transaction });
            if (!adjustment || String(adjustment.request_hash || '') !== requestHash) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Cash refund evidence could not be recorded consistently',
                    { statusCode: 409 }
                );
            }

            const updated = await posRepository.updateTransactionLifecycle(normalizedTransactionId, {
                payment_status: 'refunded'
            }, { transaction, lock: true });
            if (!updated || String(updated.payment_status || '').toLowerCase() !== 'refunded') {
                throw new DomainError(
                    DomainErrorCode.INTERNAL_ERROR,
                    'POS transaction payment status could not be updated after cash refund',
                    { statusCode: 500 }
                );
            }

            await posRepository.createAuditLog({
                user_id: actorUserId,
                entity_type: 'pos_transaction',
                entity_id: normalizedTransactionId,
                action: 'UPDATE',
                event_type: 'pos_cash_refund_completed',
                terminal_id: terminalId || shift.terminal_id || null,
                shift_id: shiftId,
                location_id: existing.location_id || shift.location_id || null,
                reason,
                changes: {
                    event: 'pos_cash_refund_completed',
                    operator_session_id: operatorSessionId,
                    invoice_number: existing.invoice_number || null,
                    transaction_id: normalizedTransactionId,
                    amount,
                    cashier_id: actorUserId,
                    original_cashier_id: parsePositiveInt(existing.cashier_id),
                    original_shift_id: parsePositiveInt(existing.shift_id),
                    refund_shift_id: shiftId,
                    cash_drawer_event_id: cashDrawerEvent.pos_cash_drawer_event_id,
                    adjustment_reference: adjustment.adjustment_reference,
                    provider_action: 'none'
                }
            }, { transaction });

            await transaction.commit();
            return ok({
                transaction: updated,
                adjustment,
                cash_drawer_event: cashDrawerEvent,
                compliance_decision: complianceDecision,
                idempotent_replay: false,
                financial_outcome: completedOutcome
            });
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            return fail(mapPosUseCaseError(error, 'Failed to record POS cash refund'));
        }
    };
};
