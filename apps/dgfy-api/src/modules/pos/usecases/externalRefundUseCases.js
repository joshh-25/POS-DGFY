import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import {
    assertComplianceOperationAllowed,
    COMPLIANCE_OPERATION
} from '../../compliance/index.js';
import dbStore from '../../../utils/dbStore.js';

const MERCHANT_OWNED_DIGITAL_TENDERS = new Set(['gcash', 'maya', 'card', 'bank_transfer']);

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const toSerializable = (value) => (
    value && typeof value.toJSON === 'function' ? value.toJSON() : value
);

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashPayload = (payload) => crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const buildExternalRefundOutcome = ({ amount, confirmed }) => ({
    internal_void: 'succeeded',
    refund_required: !confirmed,
    refund_state: confirmed ? 'completed' : 'manual_review_required',
    refund_method: 'external_reversal',
    tender_ownership: 'merchant_owned',
    next_action: confirmed ? 'none' : 'confirm_external_reversal',
    reason_code: confirmed
        ? 'MERCHANT_OWNED_EXTERNAL_REVERSAL_COMPLETED'
        : 'MERCHANT_OWNED_EXTERNAL_REVERSAL_PENDING',
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

const assertExternalRefundCompliance = async ({ terminalId, user }) => {
    const tenant = buildTenantComplianceSnapshot();
    const result = await assertComplianceOperationAllowed({
        tenantId: tenant.id,
        tenant,
        operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
        context: {
            terminal_id: terminalId || null,
            terminal_action: 'external_refund_evidence'
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
            'An open cashier shift is required for a cashier to record external reversal evidence',
            { statusCode: 422, details: { reason_code: 'POS_SHIFT_NOT_OPEN' } }
        );
    }
    if (Number(shift.cashier_id) !== shiftOwnerUserId) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only the cashier who owns the open shift can record external reversal evidence',
            { statusCode: 403, details: { reason_code: 'POS_EXTERNAL_REFUND_SHIFT_OWNER_REQUIRED' } }
        );
    }
    if (terminalId && String(shift.terminal_id) !== String(terminalId)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'External reversal shift terminal does not match the registered POS terminal',
            { statusCode: 422, details: { reason_code: 'POS_EXTERNAL_REFUND_TERMINAL_MISMATCH' } }
        );
    }
    if (locationId && Number(shift.location_id) !== Number(locationId)) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'External reversal shift location does not match the registered POS terminal',
            { statusCode: 403, details: { reason_code: 'POS_EXTERNAL_REFUND_LOCATION_MISMATCH' } }
        );
    }
};

const normalizePaymentBreakdown = (value) => {
    let parsed = value;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = [];
        }
    }
    return Array.isArray(parsed) ? parsed : [];
};

export const buildExternalRefundPosTransactionUseCase = ({ posRepository }) => {
    if (!posRepository) throw new Error('posRepository is required');

    return async ({ posTransactionId, payload = {}, user = {} } = {}) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        const actorUserId = parsePositiveInt(user?.user_id);
        const operatorSessionId = parsePositiveInt(user?.operator_session_id);
        const activeShiftId = parsePositiveInt(payload?.shift_id);
        const terminalId = String(payload?.terminal_id || '').trim().toUpperCase() || null;
        const locationId = parsePositiveInt(payload?.terminal_location_id);
        const reason = String(payload?.reason || '').trim();
        const externalReference = String(payload?.external_reference || '').trim();
        const idempotencyKey = String(payload?.idempotency_key || '').trim();
        const completionConfirmed = payload?.completion_confirmed === true;
        if (!normalizedTransactionId || !actorUserId || reason.length < 3 || externalReference.length < 3 || idempotencyKey.length < 8) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId, reason, external_reference, and idempotency_key are required',
                { statusCode: 422 }
            ));
        }
        if (!activeShiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'An active cashier shift is required to record external reversal evidence',
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
                    'Void the POS transaction before recording external reversal evidence',
                    { statusCode: 409 }
                );
            }

            const transactionLocationId = parsePositiveInt(existing.location_id);
            if (locationId && transactionLocationId !== locationId) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'POS transaction location does not match the registered terminal location',
                    { statusCode: 403, details: { reason_code: 'POS_TRANSACTION_LOCATION_MISMATCH' } }
                );
            }

            const amount = round4(existing.total_amount);
            if (amount <= 0) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'POS transaction amount must be greater than zero for an external reversal',
                    { statusCode: 409 }
                );
            }

            const requestHash = hashPayload({
                pos_transaction_id: normalizedTransactionId,
                shift_id: activeShiftId,
                terminal_id: terminalId,
                location_id: locationId,
                external_reference: externalReference,
                reason,
                completion_confirmed: completionConfirmed,
                amount
            });
            const existingByIdempotency = await posRepository.findPosTransactionAdjustmentByIdempotencyKey(
                normalizedTransactionId,
                idempotencyKey,
                { transaction, lock: true }
            );
            if (existingByIdempotency) {
                if (String(existingByIdempotency.request_hash || '') !== requestHash) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'External reversal idempotency_key was already used with a different request',
                        { statusCode: 409 }
                    );
                }
                if (existingByIdempotency.adjustment_type !== 'external_refund') {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'idempotency_key belongs to a different POS adjustment',
                        { statusCode: 409 }
                    );
                }
                const replayedTransaction = await posRepository.getTransactionById(normalizedTransactionId, {
                    transaction
                });
                await transaction.commit();
                return ok({
                    transaction: toSerializable(replayedTransaction),
                    adjustment: existingByIdempotency,
                    idempotent_replay: true,
                    compliance_decision: null
                });
            }

            const adjustments = typeof posRepository.listPosTransactionAdjustmentsForTransaction === 'function'
                ? await posRepository.listPosTransactionAdjustmentsForTransaction(normalizedTransactionId, { transaction, lock: true })
                : [];
            const externalAdjustments = (Array.isArray(adjustments) ? adjustments : []).filter((adjustment) => (
                adjustment.adjustment_type === 'external_refund'
            ));
            const successfulExternalRefund = externalAdjustments.find((adjustment) => adjustment.status === 'succeeded');
            if (successfulExternalRefund) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'An external reversal has already been confirmed for this POS transaction',
                    { statusCode: 409 }
                );
            }
            const pendingExternalRefund = externalAdjustments.find((adjustment) => (
                adjustment.status === 'manual_review_required'
                || adjustment.status === 'pending'
            ));
            if (pendingExternalRefund) {
                if (String(pendingExternalRefund.external_reference || '') !== externalReference) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'A different external reversal is already pending for this POS transaction',
                        { statusCode: 409 }
                    );
                }
                if (!completionConfirmed) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'External reversal evidence is already pending; confirm the same reference to complete it',
                        { statusCode: 409 }
                    );
                }
            }

            const paymentType = String(existing.payment_type || '').trim().toLowerCase();
            const paymentProvider = String(existing.payment_provider || '').trim().toLowerCase();
            const paymentStatus = String(existing.payment_status || '').trim().toLowerCase();
            const paymentBreakdown = normalizePaymentBreakdown(existing.payment_breakdown);
            if (completionConfirmed && !pendingExternalRefund) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Record pending external reversal evidence before confirming completion',
                    { statusCode: 409, details: { reason_code: 'POS_EXTERNAL_REFUND_PENDING_EVIDENCE_REQUIRED' } }
                );
            }
            if (pendingExternalRefund && paymentStatus !== 'refund_pending') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'External reversal confirmation requires the transaction to remain refund_pending',
                    { statusCode: 409, details: { reason_code: 'POS_EXTERNAL_REFUND_STATE_MISMATCH' } }
                );
            }
            if (
                !MERCHANT_OWNED_DIGITAL_TENDERS.has(paymentType)
                || paymentProvider !== 'merchant_owned'
                || paymentBreakdown.length > 1
                || paymentBreakdown.some((entry) => String(entry?.payment_type || '').trim().toLowerCase() !== paymentType)
                || (!pendingExternalRefund && paymentStatus !== 'paid')
            ) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'External reversal evidence supports paid, single-tender merchant-owned digital walk-in transactions only',
                    {
                        statusCode: 422,
                        details: {
                            reason_code: 'POS_EXTERNAL_REFUND_TENDER_UNSUPPORTED',
                            payment_type: paymentType || null,
                            payment_provider: paymentProvider || null,
                            payment_status: paymentStatus || null,
                            next_action: 'manual_review'
                        }
                    }
                );
            }

            const shift = activeShiftId
                ? await posRepository.getTerminalShiftById(activeShiftId, { transaction, lock: true })
                : null;
            if (activeShiftId) {
                assertOwnedOpenShift({
                    shift,
                    actorUserId,
                    shiftOwnerUserId: parsePositiveInt(user?.register_shift_owner_user_id) || actorUserId,
                    terminalId,
                    locationId
                });
            }
            const complianceDecision = await assertExternalRefundCompliance({
                terminalId: terminalId || shift?.terminal_id || existing.terminal_id || null,
                user
            });
            const adjustmentStatus = completionConfirmed ? 'succeeded' : 'manual_review_required';
            const outcome = buildExternalRefundOutcome({ amount, confirmed: completionConfirmed });
            const recordedAt = new Date();
            const adjustment = await posRepository.createPosTransactionAdjustment({
                adjustment_reference: `POS-EXT-REFUND-${normalizedTransactionId}-${requestHash.slice(0, 8)}`.slice(0, 40),
                pos_transaction_id: normalizedTransactionId,
                original_cashier_id: parsePositiveInt(existing.cashier_id),
                original_shift_id: parsePositiveInt(existing.shift_id),
                original_terminal_id: existing.terminal_id || null,
                original_location_id: transactionLocationId,
                actor_user_id: actorUserId,
                actor_shift_id: activeShiftId || null,
                actor_terminal_id: terminalId || existing.terminal_id || null,
                actor_location_id: locationId || transactionLocationId,
                adjustment_type: 'external_refund',
                tender_type: paymentType,
                amount,
                currency: 'PHP',
                status: adjustmentStatus,
                reason,
                idempotency_key: idempotencyKey,
                request_hash: requestHash,
                approved_by: completionConfirmed ? actorUserId : null,
                approved_at: completionConfirmed ? recordedAt : null,
                external_reference: externalReference,
                provider: null,
                provider_reference: null,
                provider_event_id: null,
                completed_at: completionConfirmed ? recordedAt : null,
                metadata: {
                    evidence_scope: 'walk_in_pos_merchant_owned_external_reversal',
                    operator_session_id: operatorSessionId,
                    payment_status_before_reversal: paymentStatus,
                    transaction_shift_id: parsePositiveInt(existing.shift_id),
                    actor_shift_id: activeShiftId || null,
                    completion_confirmed: completionConfirmed,
                    provider_action: 'none',
                    financial_outcome: outcome
                }
            }, { transaction });
            if (!adjustment || String(adjustment.request_hash || '') !== requestHash) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'External reversal evidence could not be recorded consistently',
                    { statusCode: 409 }
                );
            }

            const updated = await posRepository.updateTransactionLifecycle(normalizedTransactionId, {
                payment_status: completionConfirmed ? 'refunded' : 'refund_pending'
            }, { transaction, lock: true });
            if (!updated) {
                throw new DomainError(
                    DomainErrorCode.INTERNAL_ERROR,
                    'POS transaction payment status could not be updated after external reversal evidence',
                    { statusCode: 500 }
                );
            }

            await posRepository.createAuditLog({
                user_id: actorUserId,
                entity_type: 'pos_transaction',
                entity_id: normalizedTransactionId,
                action: 'UPDATE',
                event_type: completionConfirmed
                    ? 'pos_external_refund_completed'
                    : 'pos_external_refund_pending',
                terminal_id: terminalId || existing.terminal_id || null,
                shift_id: activeShiftId || null,
                location_id: transactionLocationId,
                reason,
                changes: {
                    event: completionConfirmed
                        ? 'pos_external_refund_completed'
                        : 'pos_external_refund_pending',
                    operator_session_id: operatorSessionId,
                    invoice_number: existing.invoice_number || null,
                    transaction_id: normalizedTransactionId,
                    amount,
                    payment_type: paymentType,
                    external_reference: externalReference,
                    actor_user_id: actorUserId,
                    actor_shift_id: activeShiftId || null,
                    original_cashier_id: parsePositiveInt(existing.cashier_id),
                    original_shift_id: parsePositiveInt(existing.shift_id),
                    adjustment_reference: adjustment.adjustment_reference,
                    provider_action: 'none'
                }
            }, { transaction });

            await transaction.commit();
            return ok({
                transaction: updated,
                adjustment,
                idempotent_replay: false,
                compliance_decision: complianceDecision,
                financial_outcome: outcome
            });
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            return fail(mapPosUseCaseError(error, 'Failed to record POS external reversal evidence'));
        }
    };
};
