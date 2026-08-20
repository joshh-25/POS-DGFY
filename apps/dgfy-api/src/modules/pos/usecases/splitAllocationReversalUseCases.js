import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import {
    assertComplianceOperationAllowed,
    COMPLIANCE_OPERATION
} from '../../compliance/index.js';
import dbStore from '../../../utils/dbStore.js';

const PROVIDER = 'paymongo';
const MERCHANT_OWNED_METHODS = new Set(['gcash', 'maya', 'card', 'bank_transfer']);
const REVERSAL_TYPES = new Set(['cash_refund', 'external_refund', 'provider_refund']);

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toSerializable = (value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashPayload = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

const reversalError = (code, message, statusCode, details = undefined) => (
    new DomainError(code, message, { statusCode, ...(details ? { details } : {}) })
);

const beginTransaction = async () => {
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    if (!sequelize || typeof sequelize.transaction !== 'function') {
        throw reversalError(DomainErrorCode.INTERNAL_ERROR, 'POS database transaction is unavailable.', 500);
    }
    return sequelize.transaction();
};

const finishTransaction = async (transaction, method) => {
    if (transaction && !transaction.finished && typeof transaction[method] === 'function') {
        await transaction[method]();
    }
};

const buildFinancialOutcome = ({ amount, state, method, ownership }) => ({
    internal_void: 'succeeded',
    refund_required: state !== 'completed',
    refund_state: state,
    refund_method: method,
    tender_ownership: ownership,
    next_action: state === 'completed'
        ? 'none'
        : (state === 'manual_review_required' ? 'confirm_external_reversal' : 'retry_allocation_reversal'),
    reason_code: state === 'completed'
        ? 'SPLIT_ALLOCATION_REFUND_COMPLETED'
        : (state === 'manual_review_required'
            ? 'SPLIT_ALLOCATION_EXTERNAL_REVERSAL_PENDING'
            : 'SPLIT_ALLOCATION_REFUND_PARTIAL'),
    refund_amount: round4(amount),
    currency: 'PHP'
});

const assertOwnedOpenShift = ({ shift, actorUserId, terminalId, locationId }) => {
    if (!shift || String(shift.status || '').toLowerCase() !== 'open') {
        throw reversalError(DomainErrorCode.VALIDATION_FAILED, 'An open cashier shift is required for this allocation reversal.', 422, {
            reason_code: 'POS_SHIFT_NOT_OPEN'
        });
    }
    if (Number(shift.cashier_id) !== actorUserId) {
        throw reversalError(DomainErrorCode.AUTHORIZATION_FAILED, 'Only the cashier who owns the open shift can record this allocation reversal.', 403, {
            reason_code: 'POS_REFUND_SHIFT_OWNER_REQUIRED'
        });
    }
    if (terminalId && String(shift.terminal_id || '').trim().toUpperCase() !== terminalId) {
        throw reversalError(DomainErrorCode.VALIDATION_FAILED, 'The refund shift terminal does not match the registered POS terminal.', 422, {
            reason_code: 'POS_REFUND_TERMINAL_MISMATCH'
        });
    }
    if (locationId && Number(shift.location_id) !== locationId) {
        throw reversalError(DomainErrorCode.AUTHORIZATION_FAILED, 'The refund shift location does not match the registered POS terminal.', 403, {
            reason_code: 'POS_REFUND_LOCATION_MISMATCH'
        });
    }
};

const buildTenantComplianceSnapshot = () => {
    const store = dbStore.getStore() || {};
    if (!store.tenantId) throw reversalError(DomainErrorCode.TENANT_CONTEXT_MISSING, 'Tenant compliance context is required.', 400);
    return {
        id: store.tenantId,
        compliance_mode_state: store.tenantComplianceModeState || null,
        compliance_mode_choice_required: store.tenantComplianceModeChoiceRequired === true,
        compliance_profile: store.tenantComplianceProfile || null,
        compliance_policy_version: store.tenantCompliancePolicyVersion || null
    };
};

const assertCompliance = async ({ terminalId, user, terminalAction }) => {
    const tenant = buildTenantComplianceSnapshot();
    const result = await assertComplianceOperationAllowed({
        tenantId: tenant.id,
        tenant,
        operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
        context: { terminal_id: terminalId || null, terminal_action: terminalAction },
        actorUser: user
    });
    if (!result.success) throw result.error;
    return result.data.decision;
};

const allocationAdjustmentRows = (adjustments, allocationId) => (
    (Array.isArray(adjustments) ? adjustments : []).filter((adjustment) => (
        Number(adjustment?.pos_payment_allocation_id) === Number(allocationId)
        && REVERSAL_TYPES.has(adjustment?.adjustment_type)
    ))
);

const getReversalTotals = (allocation, adjustments) => {
    const rows = allocationAdjustmentRows(adjustments, allocation.pos_payment_allocation_id);
    const confirmedAdjustmentIds = new Set(rows
        .filter((row) => row.status === 'succeeded')
        .map((row) => Number(row.metadata?.confirms_adjustment_id))
        .filter((id) => Number.isInteger(id) && id > 0));
    const succeeded = round4(rows
        .filter((row) => row.status === 'succeeded')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const pending = round4(rows
        .filter((row) => (
            ['pending', 'manual_review_required'].includes(row.status)
            && !confirmedAdjustmentIds.has(Number(row.pos_transaction_adjustment_id))
        ))
        .reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const applied = round4(allocation.applied_amount);
    return {
        rows,
        applied,
        succeeded: Math.min(succeeded, applied),
        pending: Math.min(pending, Math.max(applied - succeeded, 0)),
        remaining: round4(Math.max(applied - succeeded - pending, 0))
    };
};

const buildAllocationReversalStatus = ({ applied, succeeded, pending, manualReview = false }) => {
    if (succeeded >= applied) return 'completed';
    if (manualReview) return 'manual_review_required';
    if (pending > 0) return 'pending';
    if (succeeded > 0) return 'partial';
    return 'none';
};

const buildTransactionPaymentStatus = ({ allocations, adjustments }) => {
    const successfulAllocations = (Array.isArray(allocations) ? allocations : [])
        .filter((allocation) => allocation?.status === 'successful');
    if (!successfulAllocations.length) return 'paid';

    let allReversed = true;
    let anyReversed = false;
    let anyPending = false;
    for (const allocation of successfulAllocations) {
        const totals = getReversalTotals(allocation, adjustments);
        if (totals.succeeded > 0) anyReversed = true;
        if (totals.succeeded < totals.applied) allReversed = false;
        if (totals.pending > 0) anyPending = true;
    }
    if (allReversed) return 'refunded';
    if (anyPending) return 'refund_pending';
    if (anyReversed) return 'partial_refunded';
    return 'paid';
};

const publicAllocation = (allocation, adjustments) => {
    const serialized = toSerializable(allocation) || {};
    const totals = getReversalTotals(serialized, adjustments);
    return {
        ...serialized,
        applied_amount: round4(serialized.applied_amount),
        reversed_amount: totals.succeeded,
        reversal_status: buildAllocationReversalStatus({
            applied: totals.applied,
            succeeded: totals.succeeded,
            pending: totals.pending,
            manualReview: totals.rows.some((row) => row.status === 'manual_review_required')
        })
    };
};

const loadContext = async ({ posRepository, transactionId, allocationId, transaction }) => {
    const existing = await posRepository.getTransactionById(transactionId, { transaction, lock: true });
    if (!existing) throw reversalError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS transaction not found.', 404);
    if (String(existing.status || '').toLowerCase() !== 'voided') {
        throw reversalError(DomainErrorCode.CONFLICT, 'Void the POS transaction before reversing a split allocation.', 409, {
            reason_code: 'POS_TRANSACTION_VOID_REQUIRED'
        });
    }

    const session = await posRepository.findPosPaymentSessionByCompletedTransactionId(transactionId, { transaction, lock: true });
    if (!session || Number(session.completed_transaction_id) !== Number(transactionId)) {
        throw reversalError(DomainErrorCode.RESOURCE_NOT_FOUND, 'The POS transaction is not linked to a completed split-payment session.', 404, {
            reason_code: 'POS_SPLIT_SESSION_NOT_FOUND'
        });
    }
    const allocations = await posRepository.listPosPaymentAllocationsForSession(session.pos_payment_session_id, {
        transaction,
        lock: true
    });
    const allocation = (Array.isArray(allocations) ? allocations : []).find((row) => (
        Number(row.pos_payment_allocation_id) === Number(allocationId)
    ));
    if (!allocation) throw reversalError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Split payment allocation not found.', 404);
    if (Number(allocation.session_id) !== Number(session.pos_payment_session_id)) {
        throw reversalError(DomainErrorCode.AUTHORIZATION_FAILED, 'The allocation is outside the completed POS payment session.', 403, {
            reason_code: 'POS_SPLIT_ALLOCATION_SCOPE_DENIED'
        });
    }
    if (allocation.status !== 'successful') {
        throw reversalError(DomainErrorCode.CONFLICT, 'Only successful split allocations can be reversed.', 409, {
            reason_code: 'POS_SPLIT_ALLOCATION_NOT_SUCCESSFUL'
        });
    }
    const adjustments = await posRepository.listPosTransactionAdjustmentsForTransaction(transactionId, {
        transaction,
        lock: true
    });
    return { existing, session, allocations, allocation, adjustments };
};

const resolveTender = (allocation) => {
    const paymentMethod = String(allocation.payment_method || '').trim().toLowerCase();
    const paymentProvider = String(allocation.payment_provider || '').trim().toLowerCase();
    if (paymentMethod === 'cash') return { kind: 'cash', adjustmentType: 'cash_refund', method: 'cash', ownership: 'merchant_owned' };
    if (paymentProvider === 'merchant_owned' && MERCHANT_OWNED_METHODS.has(paymentMethod)) {
        return { kind: 'merchant_owned', adjustmentType: 'external_refund', method: 'external_reversal', ownership: 'merchant_owned' };
    }
    if (paymentProvider === PROVIDER) {
        return { kind: 'provider_owned', adjustmentType: 'provider_refund', method: 'provider_refund', ownership: 'provider_owned' };
    }
    throw reversalError(DomainErrorCode.VALIDATION_FAILED, 'The split allocation has no supported reversal ownership classification.', 422, {
        reason_code: 'POS_SPLIT_ALLOCATION_TENDER_UNSUPPORTED',
        payment_method: paymentMethod || null,
        payment_provider: paymentProvider || null
    });
};

const resolveScope = async ({ posRepository, payload, user, existing, tender, transaction }) => {
    const actorUserId = parsePositiveInt(user?.user_id);
    const shiftId = parsePositiveInt(payload.shift_id);
    const terminalId = String(payload.terminal_id || '').trim().toUpperCase() || null;
    const locationId = parsePositiveInt(payload.terminal_location_id || payload.location_id);
    if (!actorUserId) throw reversalError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated POS user is required.', 401);
    if (!shiftId) {
        const isCashRefund = tender.kind === 'cash';
        throw reversalError(DomainErrorCode.VALIDATION_FAILED, isCashRefund
            ? 'Cash allocation reversal requires the actual refunding cashier shift.'
            : 'An open cashier shift is required for this allocation reversal.', 422, {
            reason_code: isCashRefund ? 'POS_CASH_REFUND_SHIFT_REQUIRED' : 'POS_SHIFT_REQUIRED'
        });
    }
    if (locationId && Number(existing.location_id) !== locationId) {
        throw reversalError(DomainErrorCode.AUTHORIZATION_FAILED, 'The POS transaction location does not match the registered terminal.', 403, {
            reason_code: 'POS_TRANSACTION_LOCATION_MISMATCH'
        });
    }
    const shift = shiftId
        ? await posRepository.getTerminalShiftById(shiftId, { transaction, lock: true })
        : null;
    if (shiftId) assertOwnedOpenShift({ shift, actorUserId, terminalId, locationId });
    return {
        actorUserId,
        shiftId,
        terminalId: terminalId || shift?.terminal_id || existing.terminal_id || null,
        locationId: locationId || parsePositiveInt(existing.location_id),
        shift
    };
};

const loadExistingAdjustment = async ({ posRepository, transactionId, idempotencyKey, allocationId, requestHash, transaction }) => {
    const existing = await posRepository.findPosTransactionAdjustmentByIdempotencyKey(transactionId, idempotencyKey, {
        transaction,
        lock: true
    });
    if (!existing) return null;
    if (String(existing.request_hash || '') !== requestHash) {
        throw reversalError(DomainErrorCode.CONFLICT, 'The allocation reversal idempotency key was already used with different data.', 409, {
            reason_code: 'POS_SPLIT_ALLOCATION_IDEMPOTENCY_CONFLICT'
        });
    }
    if (Number(existing.pos_payment_allocation_id) !== Number(allocationId)) {
        throw reversalError(DomainErrorCode.CONFLICT, 'The allocation reversal idempotency key belongs to a different allocation.', 409, {
            reason_code: 'POS_SPLIT_ALLOCATION_IDEMPOTENCY_SCOPE_CONFLICT'
        });
    }
    return existing;
};

const getProviderReversalEvidence = async ({ providerReconciler, session, allocation, payload }) => {
    if (typeof providerReconciler !== 'function') {
        throw reversalError(DomainErrorCode.SERVICE_UNAVAILABLE, 'Provider reconciliation is unavailable for this split allocation.', 503, {
            reason_code: 'PAYMENT_PROVIDER_RECONCILIATION_UNAVAILABLE'
        });
    }
    let reconciliation;
    try {
        reconciliation = await providerReconciler({ session, allocation, payload });
    } catch (error) {
        throw reversalError(DomainErrorCode.CONFLICT, 'Provider reversal evidence could not be verified.', 409, {
            reason_code: 'PAYMENT_PROVIDER_RECONCILIATION_FAILED',
            cause: error?.message
        });
    }
    if (reconciliation?.reconciled !== true || reconciliation.action !== 'reverse') {
        throw reversalError(DomainErrorCode.CONFLICT, reconciliation?.reason || 'A full provider refund must be visible before this allocation can be marked reversed.', 409, {
            reason_code: reconciliation?.reason_code || 'PAYMENT_PROVIDER_REFUND_REQUIRED',
            ...(reconciliation?.details || {})
        });
    }
    const refundEventId = String(reconciliation.provider_refund_event_id || '').trim();
    if (refundEventId.length < 8) {
        throw reversalError(DomainErrorCode.CONFLICT, 'Provider reversal evidence has no stable refund event identity.', 409, {
            reason_code: 'PAYMENT_PROVIDER_REFUND_EVENT_ID_REQUIRED'
        });
    }
    return { ...reconciliation, provider_refund_event_id: refundEventId };
};

export const buildSplitAllocationReversalUseCase = ({ posRepository, providerReconciler }) => {
    if (!posRepository) throw new Error('posRepository is required');

    return async ({ posTransactionId, allocationId, payload = {}, user = {} } = {}) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        const normalizedAllocationId = parsePositiveInt(allocationId);
        const actorUserId = parsePositiveInt(user?.user_id);
        const reason = String(payload.reason || '').trim();
        const idempotencyKey = String(payload.idempotency_key || '').trim();
        const completionConfirmed = payload.completion_confirmed === true;
        const externalReference = String(payload.external_reference || '').trim();
        const requestedAmount = payload.amount == null ? null : round4(payload.amount);
        if (!normalizedTransactionId || !normalizedAllocationId || !actorUserId || reason.length < 3 || idempotencyKey.length < 8) {
            return fail(reversalError(DomainErrorCode.VALIDATION_FAILED, 'posTransactionId, allocationId, reason, and idempotency_key are required.', 422));
        }
        if (requestedAmount != null && requestedAmount <= 0) {
            return fail(reversalError(DomainErrorCode.VALIDATION_FAILED, 'amount must be greater than zero.', 422));
        }

        let transaction = null;
        try {
            transaction = await beginTransaction();
            const context = await loadContext({
                posRepository,
                transactionId: normalizedTransactionId,
                allocationId: normalizedAllocationId,
                transaction
            });
            const tender = resolveTender(context.allocation);
            const scope = await resolveScope({
                posRepository,
                payload,
                user,
                existing: context.existing,
                tender,
                transaction
            });
            const totals = getReversalTotals(context.allocation, context.adjustments);
            const requestHash = hashPayload({
                pos_transaction_id: normalizedTransactionId,
                pos_payment_allocation_id: normalizedAllocationId,
                amount: requestedAmount,
                shift_id: scope.shiftId,
                terminal_id: scope.terminalId,
                location_id: scope.locationId,
                external_reference: externalReference || null,
                completion_confirmed: completionConfirmed,
                reason,
                tender: tender.kind
            });
            const existingAdjustment = await loadExistingAdjustment({
                posRepository,
                transactionId: normalizedTransactionId,
                allocationId: normalizedAllocationId,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (existingAdjustment) {
                await finishTransaction(transaction, 'commit');
                return ok({
                    transaction: toSerializable(context.existing),
                    allocation: publicAllocation(context.allocation, context.adjustments),
                    adjustment: toSerializable(existingAdjustment),
                    idempotent_replay: true
                }, 'Split allocation reversal replayed');
            }

            const pendingExternal = totals.rows.find((row) => (
                row.adjustment_type === 'external_refund'
                && ['pending', 'manual_review_required'].includes(row.status)
            ));
            if (tender.kind === 'merchant_owned') {
                if (externalReference.length < 3) {
                    throw reversalError(DomainErrorCode.VALIDATION_FAILED, 'external_reference is required for a merchant-owned split reversal.', 422);
                }
                if (completionConfirmed) {
                    if (!pendingExternal || String(pendingExternal.external_reference || '') !== externalReference) {
                        throw reversalError(DomainErrorCode.CONFLICT, 'A matching pending external reversal is required before confirmation.', 409, {
                            reason_code: 'POS_SPLIT_EXTERNAL_PENDING_EVIDENCE_REQUIRED'
                        });
                    }
                    if (requestedAmount != null && requestedAmount !== round4(pendingExternal.amount)) {
                        throw reversalError(DomainErrorCode.CONFLICT, 'The confirmation amount must match the pending external reversal.', 409, {
                            reason_code: 'POS_SPLIT_EXTERNAL_CONFIRMATION_AMOUNT_MISMATCH'
                        });
                    }
                } else if (pendingExternal) {
                    throw reversalError(DomainErrorCode.CONFLICT, 'A different idempotency key is already pending for this allocation; confirm the same external reference.', 409, {
                        reason_code: 'POS_SPLIT_EXTERNAL_REVERSAL_PENDING'
                    });
                }
            } else if (completionConfirmed || externalReference) {
                throw reversalError(DomainErrorCode.VALIDATION_FAILED, 'completion_confirmed and external_reference are only valid for merchant-owned digital tenders.', 422);
            }

            const availableAmount = completionConfirmed && pendingExternal
                ? round4(totals.remaining + Number(pendingExternal.amount || 0))
                : totals.remaining;
            const amount = completionConfirmed && pendingExternal
                ? round4(pendingExternal.amount)
                : round4(requestedAmount == null ? totals.remaining : requestedAmount);
            if (amount <= 0 || amount > availableAmount) {
                throw reversalError(DomainErrorCode.VALIDATION_FAILED, 'The requested reversal exceeds the allocation amount still available for reversal.', 422, {
                    reason_code: 'POS_SPLIT_ALLOCATION_REVERSAL_AMOUNT_EXCEEDED',
                    allocation_amount: totals.applied,
                    reversed_amount: totals.succeeded,
                    pending_amount: totals.pending,
                    remaining_amount: availableAmount
                });
            }
            if (tender.kind === 'provider_owned' && amount !== totals.remaining) {
                throw reversalError(DomainErrorCode.CONFLICT, 'Provider-owned split reversal requires full allocation refund evidence; partial provider refunds remain manual review.', 409, {
                    reason_code: 'PAYMENT_PROVIDER_PARTIAL_REFUND_REQUIRES_REVIEW'
                });
            }

            let complianceDecision = null;
            let providerEvidence = null;
            if (tender.kind === 'cash') {
                complianceDecision = await assertCompliance({ terminalId: scope.terminalId, user, terminalAction: 'split_allocation_cash_refund' });
            } else if (tender.kind === 'merchant_owned') {
                complianceDecision = await assertCompliance({ terminalId: scope.terminalId, user, terminalAction: 'split_allocation_external_reversal' });
            } else {
                complianceDecision = await assertCompliance({ terminalId: scope.terminalId, user, terminalAction: 'split_allocation_provider_refund' });
                providerEvidence = await getProviderReversalEvidence({
                    providerReconciler,
                    session: context.session,
                    allocation: context.allocation,
                    payload
                });
                const replay = typeof posRepository.findPosTransactionAdjustmentByProviderEventId === 'function'
                    ? await posRepository.findPosTransactionAdjustmentByProviderEventId(providerEvidence.provider_refund_event_id, { transaction, lock: true })
                    : null;
                if (replay && Number(replay.pos_payment_allocation_id) !== normalizedAllocationId) {
                    throw reversalError(DomainErrorCode.CONFLICT, 'The provider refund evidence is already attached to another split allocation.', 409, {
                        reason_code: 'PAYMENT_PROVIDER_REFUND_EVENT_REPLAY'
                    });
                }
            }

            const reversalStatus = completionConfirmed ? 'succeeded' : (tender.kind === 'merchant_owned' ? 'manual_review_required' : 'succeeded');
            const now = new Date();
            const financialOutcome = buildFinancialOutcome({
                amount,
                state: reversalStatus === 'succeeded' ? 'completed' : 'manual_review_required',
                method: tender.method,
                ownership: tender.ownership
            });
            const cashDrawerEvent = tender.kind === 'cash'
                ? await posRepository.createCashDrawerEvent({
                    pos_terminal_shift_id: scope.shiftId,
                    event_type: 'cash_out',
                    amount,
                    reason: `Split allocation refund for ${context.existing.invoice_number || `POS-${normalizedTransactionId}`}: ${reason}`.slice(0, 255),
                    recorded_by: actorUserId
                }, { transaction })
                : null;
            if (tender.kind === 'cash' && !cashDrawerEvent?.pos_cash_drawer_event_id) {
                throw reversalError(DomainErrorCode.INTERNAL_ERROR, 'Split allocation cash-out evidence could not be recorded.', 500);
            }

            const adjustment = await posRepository.createPosTransactionAdjustment({
                adjustment_reference: `POS-SPLIT-${normalizedTransactionId}-${normalizedAllocationId}-${requestHash.slice(0, 8)}`.slice(0, 40),
                pos_transaction_id: normalizedTransactionId,
                pos_payment_allocation_id: normalizedAllocationId,
                original_cashier_id: parsePositiveInt(context.existing.cashier_id),
                original_shift_id: parsePositiveInt(context.existing.shift_id),
                original_terminal_id: context.existing.terminal_id || null,
                original_location_id: parsePositiveInt(context.existing.location_id),
                actor_user_id: actorUserId,
                actor_shift_id: scope.shiftId,
                actor_terminal_id: scope.terminalId,
                actor_location_id: scope.locationId,
                adjustment_type: tender.adjustmentType,
                tender_type: context.allocation.payment_method,
                amount,
                currency: 'PHP',
                status: reversalStatus,
                reason,
                idempotency_key: idempotencyKey,
                request_hash: requestHash,
                approved_by: reversalStatus === 'succeeded' ? actorUserId : null,
                approved_at: reversalStatus === 'succeeded' ? now : null,
                external_reference: tender.kind === 'merchant_owned' ? externalReference : null,
                provider: tender.kind === 'provider_owned' ? PROVIDER : null,
                provider_reference: providerEvidence?.provider_refund_ids?.[0] || null,
                provider_event_id: providerEvidence?.provider_refund_event_id || null,
                cash_drawer_event_id: cashDrawerEvent?.pos_cash_drawer_event_id || null,
                completed_at: reversalStatus === 'succeeded' ? now : null,
                metadata: {
                    evidence_scope: 'pos_split_allocation_reversal',
                    payment_session_id: Number(context.session.pos_payment_session_id),
                    payment_session_reference: context.session.session_reference,
                    payment_allocation_id: normalizedAllocationId,
                    allocation_amount: totals.applied,
                    allocation_reversed_before: totals.succeeded,
                    allocation_pending_before: totals.pending,
                    transaction_shift_id: parsePositiveInt(context.existing.shift_id),
                    actor_shift_id: scope.shiftId,
                    authorization_mode: 'cashier_shift',
                    provider_action: tender.kind === 'provider_owned' ? 'reconcile_evidence_only' : 'none',
                    confirms_adjustment_id: completionConfirmed && pendingExternal
                        ? Number(pendingExternal.pos_transaction_adjustment_id)
                        : null,
                    financial_outcome: financialOutcome
                }
            }, { transaction });
            if (!adjustment || String(adjustment.request_hash || '') !== requestHash) {
                throw reversalError(DomainErrorCode.CONFLICT, 'Split allocation reversal evidence could not be recorded consistently.', 409);
            }

            const updatedAdjustments = [...context.adjustments, adjustment];
            const updatedTotals = getReversalTotals(context.allocation, updatedAdjustments);
            const updatedAllocation = await posRepository.updatePosPaymentAllocation(normalizedAllocationId, {
                reversed_amount: updatedTotals.succeeded,
                reversal_status: buildAllocationReversalStatus({
                    applied: updatedTotals.applied,
                    succeeded: updatedTotals.succeeded,
                    pending: updatedTotals.pending,
                    manualReview: updatedAdjustments.some((row) => (
                        Number(row.pos_payment_allocation_id) === normalizedAllocationId
                        && row.status === 'manual_review_required'
                    ))
                })
            }, { transaction, lock: true });
            const updatedPaymentStatus = buildTransactionPaymentStatus({
                allocations: context.allocations.map((row) => Number(row.pos_payment_allocation_id) === normalizedAllocationId ? updatedAllocation : row),
                adjustments: updatedAdjustments
            });
            const updatedTransaction = await posRepository.updateTransactionLifecycle(normalizedTransactionId, {
                payment_status: updatedPaymentStatus
            }, { transaction, lock: true });
            if (!updatedTransaction || !updatedAllocation) {
                throw reversalError(DomainErrorCode.INTERNAL_ERROR, 'Split allocation reversal state could not be finalized.', 500);
            }

            await posRepository.createAuditLog({
                user_id: actorUserId,
                entity_type: 'pos_transaction',
                entity_id: normalizedTransactionId,
                action: 'UPDATE',
                event_type: reversalStatus === 'succeeded'
                    ? 'pos_split_allocation_refund_completed'
                    : 'pos_split_allocation_external_refund_pending',
                terminal_id: scope.terminalId,
                shift_id: scope.shiftId,
                location_id: scope.locationId,
                reason,
                changes: {
                    event: reversalStatus === 'succeeded'
                        ? 'pos_split_allocation_refund_completed'
                        : 'pos_split_allocation_external_refund_pending',
                    transaction_id: normalizedTransactionId,
                    payment_session_id: Number(context.session.pos_payment_session_id),
                    payment_allocation_id: normalizedAllocationId,
                    amount,
                    payment_method: context.allocation.payment_method,
                    payment_provider: context.allocation.payment_provider,
                    payment_status: updatedPaymentStatus,
                    actor_user_id: actorUserId,
                    actor_shift_id: scope.shiftId,
                    adjustment_reference: adjustment.adjustment_reference,
                    cash_drawer_event_id: cashDrawerEvent?.pos_cash_drawer_event_id || null,
                    provider_refund_event_id: providerEvidence?.provider_refund_event_id || null
                }
            }, { transaction });

            await finishTransaction(transaction, 'commit');
            return ok({
                transaction: toSerializable(updatedTransaction),
                allocation: publicAllocation(updatedAllocation, updatedAdjustments),
                adjustment: toSerializable(adjustment),
                cash_drawer_event: cashDrawerEvent ? toSerializable(cashDrawerEvent) : null,
                compliance_decision: complianceDecision,
                provider_evidence: providerEvidence,
                idempotent_replay: false,
                financial_outcome: financialOutcome
            }, reversalStatus === 'succeeded'
                ? 'Split allocation reversal completed'
                : 'Split allocation external reversal evidence recorded and pending confirmation');
        } catch (error) {
            await finishTransaction(transaction, 'rollback');
            return fail(mapPosUseCaseError(error, 'Failed to reverse split payment allocation'));
        }
    };
};
