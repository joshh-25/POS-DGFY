import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import {
    assertComplianceOperationAllowed,
    COMPLIANCE_OPERATION
} from '../../compliance/index.js';
import { reconcileRefundedPaymentState } from '../../commercePayments/usecases/commercePaymentAdminUseCases.js';
import { recordSucceededTenantRevenueRefundUseCase } from '../../tenantRevenue/index.js';
import dbStore from '../../../utils/dbStore.js';

const PROVIDER = 'paymongo';
const PAYMENT_REFERENCE_PATTERN = /^pay_[A-Za-z0-9]+$/;
const SESSION_REFERENCE_PATTERN = /^CPS-[A-Za-z0-9-]+$/i;
const PROVIDER_REFUND_SUCCESS_STATUSES = new Set(['succeeded', 'success', 'refunded', 'completed']);
const PROVIDER_REFUND_PENDING_STATUSES = new Set(['created', 'pending', 'processing', 'queued']);
const PROVIDER_REFUND_FAILURE_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'error']);
const PROVIDER_TENDER_TYPES = new Set(['qrph', 'card', 'gcash', 'maya', 'grab_pay', 'shopeepay']);

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toCentavos = (value) => Math.round((Number(value) || 0) * 100);
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

const isPosAdminOperator = (user = {}) => (
    user?.is_master_admin === true
    || user?.is_master_admin === 1
    || user?.is_master_admin === '1'
    || String(user?.role || '').trim().toLowerCase() === 'admin'
);

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

const getProviderAttributes = (resource = {}) => resource?.attributes || resource || {};

const normalizeProviderMethod = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'paymaya') return 'maya';
    if (normalized === 'shopee_pay') return 'shopeepay';
    return normalized;
};

const getProviderMethod = (resource = {}) => {
    const attributes = getProviderAttributes(resource);
    return normalizeProviderMethod(
        attributes.source?.type
        || attributes.payment_method_used
        || attributes.payment_method?.attributes?.type
        || attributes.payment_method?.type
    );
};

const getProviderRefunds = (resource = {}) => {
    const attributes = getProviderAttributes(resource);
    const source = Array.isArray(attributes.refunds?.data)
        ? attributes.refunds.data
        : (Array.isArray(attributes.refunds) ? attributes.refunds : []);
    return source.map((refund) => {
        const refundAttributes = getProviderAttributes(refund);
        return {
            id: String(refund?.id || refundAttributes.id || '').trim(),
            status: String(refundAttributes.status || '').trim().toLowerCase(),
            amount: Number(refundAttributes.amount || 0),
            notes: String(refundAttributes.notes || '').trim(),
            updated_at: refundAttributes.updated_at || refundAttributes.created_at || null,
            resource: refund
        };
    }).filter((refund) => refund.id);
};

const buildFinancialOutcome = ({ amount, state }) => ({
    internal_void: 'succeeded',
    refund_required: state !== 'completed',
    refund_state: state,
    refund_method: 'provider_refund',
    tender_ownership: 'provider_owned',
    next_action: state === 'completed' ? 'none' : 'retry_provider_refund',
    reason_code: state === 'completed'
        ? 'PROVIDER_REFUND_COMPLETED'
        : (state === 'pending' ? 'PROVIDER_REFUND_PENDING' : 'PROVIDER_REFUND_RETRYABLE_FAILURE'),
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

const assertProviderRefundCompliance = async ({ terminalId, user }) => {
    const tenant = buildTenantComplianceSnapshot();
    const result = await assertComplianceOperationAllowed({
        tenantId: tenant.id,
        tenant,
        operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
        context: {
            terminal_id: terminalId || null,
            terminal_action: 'provider_refund'
        },
        actorUser: user
    });
    if (!result.success) throw result.error;
    return result.data.decision;
};

const assertOwnedOpenShift = ({ shift, actorUserId, terminalId, locationId }) => {
    if (!shift || String(shift.status || '').toLowerCase() !== 'open') {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'An open cashier shift is required for a cashier to record a provider refund',
            { statusCode: 422, details: { reason_code: 'POS_SHIFT_NOT_OPEN' } }
        );
    }
    if (Number(shift.cashier_id) !== actorUserId) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only the cashier who owns the open shift can record a provider refund',
            { statusCode: 403, details: { reason_code: 'POS_PROVIDER_REFUND_SHIFT_OWNER_REQUIRED' } }
        );
    }
    if (terminalId && String(shift.terminal_id) !== String(terminalId)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Provider refund shift terminal does not match the registered POS terminal',
            { statusCode: 422, details: { reason_code: 'POS_PROVIDER_REFUND_TERMINAL_MISMATCH' } }
        );
    }
    if (locationId && Number(shift.location_id) !== Number(locationId)) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Provider refund shift location does not match the registered POS terminal',
            { statusCode: 403, details: { reason_code: 'POS_PROVIDER_REFUND_LOCATION_MISMATCH' } }
        );
    }
};

const classifyProviderRefundStatus = (value) => {
    const status = String(value || '').trim().toLowerCase();
    if (PROVIDER_REFUND_SUCCESS_STATUSES.has(status)) return 'completed';
    if (PROVIDER_REFUND_FAILURE_STATUSES.has(status)) return 'failed';
    return 'pending';
};

const providerRefundAdjustmentStatus = (state) => (
    state === 'completed' ? 'succeeded' : (state === 'failed' ? 'failed' : 'pending')
);

const providerEventId = (providerRefundId, providerStatus) => (
    providerRefundId ? `${PROVIDER}:refund:${providerRefundId}:${providerStatus}` : null
);

const buildProviderRefundMarker = ({ transactionId, idempotencyKey }) => (
    `POS-PROVIDER-REFUND:${transactionId}:${idempotencyKey}`.slice(0, 220)
);

const buildProviderRefundReason = (value) => {
    const reason = String(value || '').trim().toLowerCase();
    return ['requested_by_customer', 'duplicate', 'fraudulent', 'others'].includes(reason)
        ? reason
        : 'others';
};

const recoverCommerceRefundLedger = async ({
    commercePaymentRepository,
    session,
    providerRefund,
    providerRefundMarker,
    actor,
    reconcileCommercePaymentRefundState,
    recordSucceededRevenueRefund
}) => {
    if (typeof commercePaymentRepository.listRefundsBySession !== 'function') return null;
    const refunds = await commercePaymentRepository.listRefundsBySession(session.session_id);
    const providerRefundId = String(providerRefund?.id || '').trim();
    const matchingRefund = (Array.isArray(refunds) ? refunds : []).find((refund) => (
        (providerRefundId && String(refund.provider_refund_id || '').trim() === providerRefundId)
        || String(refund.notes || '').includes(providerRefundMarker)
    ));
    if (!matchingRefund) return null;
    if (matchingRefund.status === 'succeeded' && String(matchingRefund.provider_refund_id || '').trim() === providerRefundId) {
        const reconciledSession = await reconcileCommercePaymentRefundState({ commercePaymentRepository, session });
        const revenueResult = await recordSucceededRevenueRefund({
            session: reconciledSession,
            refund: matchingRefund,
            actor: actor || 'pos_provider_refund_recovery'
        });
        if (!revenueResult?.success) throw revenueResult?.error || new Error('Recovered provider refund revenue state could not be confirmed');
        return { commerceRefund: matchingRefund, session: reconciledSession };
    }

    const updatedRefund = await commercePaymentRepository.updateRefundById(matchingRefund.refund_id, {
        status: 'succeeded',
        provider_refund_id: providerRefundId || matchingRefund.provider_refund_id || null,
        provider_payload: providerRefund.resource || null,
        failure_code: null,
        failure_reason: null
    });
    const updatedSession = await reconcileCommercePaymentRefundState({ commercePaymentRepository, session });
    const revenueResult = await recordSucceededRevenueRefund({
        session: updatedSession,
        refund: updatedRefund,
        actor: actor || 'pos_provider_refund_recovery'
    });
    if (!revenueResult?.success) throw revenueResult?.error || new Error('Recovered provider refund could not be posted to tenant revenue');
    return { commerceRefund: updatedRefund, session: updatedSession };
};

const providerRefundError = (code, message, statusCode, details = undefined) => (
    new DomainError(code, message, { statusCode, ...(details ? { details } : {}) })
);

const assertOnlineProviderTransaction = ({ existing, locationId }) => {
    const paymentProvider = String(existing.payment_provider || '').trim().toLowerCase();
    const paymentReference = String(existing.payment_reference || '').trim();
    const sessionReference = String(existing.payment_session_reference || '').trim();
    const paymentType = String(existing.payment_type || '').trim().toLowerCase();
    const paymentStatus = String(existing.payment_status || '').trim().toLowerCase();
    const breakdown = normalizePaymentBreakdown(existing.payment_breakdown);
    if (locationId && parsePositiveInt(existing.location_id) !== locationId) {
        throw providerRefundError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'POS transaction location does not match the registered terminal location',
            403,
            { reason_code: 'POS_TRANSACTION_LOCATION_MISMATCH' }
        );
    }
    if (String(existing.order_source || '').trim().toLowerCase() === 'in_store') {
        throw providerRefundError(
            DomainErrorCode.VALIDATION_FAILED,
            'Walk-in POS payments cannot use the provider refund flow',
            422,
            { reason_code: 'POS_PROVIDER_REFUND_WALK_IN_NOT_ALLOWED' }
        );
    }
    if (paymentProvider !== PROVIDER || !PAYMENT_REFERENCE_PATTERN.test(paymentReference) || !SESSION_REFERENCE_PATTERN.test(sessionReference)) {
        throw providerRefundError(
            DomainErrorCode.VALIDATION_FAILED,
            'A server-owned PayMongo payment identity and payment session are required',
            422,
            { reason_code: 'POS_PROVIDER_REFUND_IDENTITY_REQUIRED' }
        );
    }
    if (!PROVIDER_TENDER_TYPES.has(paymentType) || breakdown.length > 1 || breakdown.some((entry) => (
        String(entry?.payment_type || '').trim().toLowerCase() !== paymentType
    ))) {
        throw providerRefundError(
            DomainErrorCode.VALIDATION_FAILED,
            'Provider refunds support online single-tender POS transactions only',
            422,
            { reason_code: 'POS_PROVIDER_REFUND_TENDER_UNSUPPORTED' }
        );
    }
    if (!['paid', 'refund_pending', 'refunded'].includes(paymentStatus)) {
        throw providerRefundError(
            DomainErrorCode.CONFLICT,
            'Only paid or already-pending provider refunds can be retried',
            409,
            { reason_code: 'POS_PROVIDER_REFUND_PAYMENT_NOT_REFUNDABLE', payment_status: paymentStatus || null }
        );
    }
    return { paymentProvider, paymentReference, sessionReference, paymentType, paymentStatus };
};

const verifyCommercePaymentSession = async ({ commercePaymentRepository, sessionReference, transactionId, paymentReference, amount }) => {
    const session = await commercePaymentRepository.findSessionByPublicReference(sessionReference);
    const tenantId = dbStore.getStore()?.tenantId;
    if (!session
        || String(session.provider || '').trim().toLowerCase() !== PROVIDER
        || String(session.tenant_id || '') !== String(tenantId || '')
        || Number(session.pos_transaction_id) !== Number(transactionId)
        || String(session.provider_payment_id || '').trim() !== paymentReference
        || Number(session.total_amount_centavos) !== toCentavos(amount)
        || String(session.currency || 'PHP').trim().toUpperCase() !== 'PHP') {
        throw providerRefundError(
            DomainErrorCode.CONFLICT,
            'The PayMongo payment session is not bound to this POS transaction amount and identity',
            409,
            { reason_code: 'POS_PROVIDER_REFUND_SESSION_SCOPE_MISMATCH' }
        );
    }
    if (!['paid', 'finalized', 'refund_pending', 'partial_refunded'].includes(String(session.status || '').trim().toLowerCase())) {
        throw providerRefundError(
            DomainErrorCode.CONFLICT,
            'The PayMongo payment session is not refundable in its current state',
            409,
            { reason_code: 'POS_PROVIDER_REFUND_SESSION_NOT_REFUNDABLE', session_status: session.status }
        );
    }
    return session;
};

const verifyProviderPayment = async ({ paymongoService, paymentReference, paymentType, amount, session }) => {
    if (!paymongoService || typeof paymongoService.getPayment !== 'function') {
        throw providerRefundError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'PayMongo payment verification is unavailable',
            503,
            { reason_code: 'POS_PROVIDER_REFUND_VERIFIER_UNAVAILABLE' }
        );
    }
    let payment;
    try {
        payment = await paymongoService.getPayment(paymentReference);
    } catch (error) {
        throw providerRefundError(
            DomainErrorCode.CONFLICT,
            'PayMongo payment verification failed; the refund remains retryable',
            409,
            { reason_code: 'POS_PROVIDER_REFUND_VERIFICATION_FAILED', cause: error?.message }
        );
    }
    if (!payment || String(payment.id || '').trim() !== paymentReference) {
        throw providerRefundError(
            DomainErrorCode.CONFLICT,
            'PayMongo did not return the server-recorded payment identity',
            409,
            { reason_code: 'POS_PROVIDER_REFUND_PAYMENT_ID_MISMATCH' }
        );
    }
    const attributes = getProviderAttributes(payment);
    const providerStatus = String(attributes.status || '').trim().toLowerCase();
    const providerAmount = Number(attributes.amount || 0);
    const currency = String(attributes.currency || '').trim().toUpperCase();
    const providerMethod = getProviderMethod(payment);
    const expectedMethod = paymentType === 'maya' ? new Set(['maya', 'paymaya']) : new Set([paymentType]);
    if (providerStatus !== 'paid') {
        throw providerRefundError(
            DomainErrorCode.CONFLICT,
            'PayMongo has not confirmed this payment as paid',
            409,
            { reason_code: 'POS_PROVIDER_REFUND_PAYMENT_NOT_PAID', provider_status: providerStatus || null }
        );
    }
    if (currency !== 'PHP' || providerAmount !== toCentavos(amount)) {
        throw providerRefundError(
            DomainErrorCode.CONFLICT,
            'PayMongo payment amount or currency does not match the POS transaction',
            409,
            {
                reason_code: 'POS_PROVIDER_REFUND_AMOUNT_MISMATCH',
                expected_amount_centavos: toCentavos(amount),
                provider_amount_centavos: providerAmount,
                provider_currency: currency || null
            }
        );
    }
    if (!providerMethod || !expectedMethod.has(providerMethod)) {
        throw providerRefundError(
            DomainErrorCode.CONFLICT,
            'PayMongo payment method does not match the POS transaction',
            409,
            { reason_code: 'POS_PROVIDER_REFUND_METHOD_MISMATCH', expected_method: paymentType, provider_method: providerMethod || null }
        );
    }
    const sessionPayload = session.checkout_payload && typeof session.checkout_payload === 'string'
        ? (() => { try { return JSON.parse(session.checkout_payload); } catch { return {}; } })()
        : (session.checkout_payload || {});
    const sessionPaymentType = String(sessionPayload.payment_type || '').trim().toLowerCase();
    if (sessionPaymentType && sessionPaymentType !== paymentType) {
        throw providerRefundError(
            DomainErrorCode.CONFLICT,
            'PayMongo session payment method does not match the POS transaction',
            409,
            { reason_code: 'POS_PROVIDER_REFUND_SESSION_METHOD_MISMATCH' }
        );
    }
    return { payment, refunds: getProviderRefunds(payment) };
};

const getProviderAdjustment = (adjustments = []) => (
    (Array.isArray(adjustments) ? adjustments : []).filter((adjustment) => adjustment.adjustment_type === 'provider_refund')
);

const buildOutcomeFromAdjustment = (adjustment, amount) => {
    const state = adjustment?.status === 'succeeded'
        ? 'completed'
        : (adjustment?.status === 'pending' ? 'pending' : 'manual_review_required');
    return buildFinancialOutcome({ amount, state });
};

export const buildProviderRefundPosTransactionUseCase = ({
    posRepository,
    commercePaymentRepository,
    createCommercePaymentRefundUseCase,
    paymongoService,
    reconcileCommercePaymentRefundState = reconcileRefundedPaymentState,
    recordSucceededRevenueRefund = recordSucceededTenantRevenueRefundUseCase
}) => {
    if (!posRepository || !commercePaymentRepository || typeof createCommercePaymentRefundUseCase !== 'function') {
        throw new Error('provider refund dependencies are required');
    }

    return async ({ posTransactionId, payload = {}, user = {} } = {}) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        const actorUserId = parsePositiveInt(user?.user_id);
        const activeShiftId = parsePositiveInt(payload?.shift_id);
        const terminalId = String(payload?.terminal_id || '').trim().toUpperCase() || null;
        const locationId = parsePositiveInt(payload?.terminal_location_id);
        const reason = String(payload?.reason || '').trim();
        const idempotencyKey = String(payload?.idempotency_key || '').trim();
        const providerReason = buildProviderRefundReason(payload?.provider_reason);
        const adminShiftBypass = isPosAdminOperator(user) && !activeShiftId;

        if (!normalizedTransactionId || !actorUserId || reason.length < 3 || idempotencyKey.length < 8) {
            return fail(providerRefundError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId, reason, and idempotency_key are required',
                422
            ));
        }
        if (!activeShiftId && !adminShiftBypass) {
            return fail(providerRefundError(
                DomainErrorCode.VALIDATION_FAILED,
                'An active cashier shift is required to record a provider refund',
                422
            ));
        }

        let transaction = null;
        let prepared = null;
        let replayPendingAdjustment = null;
        try {
            const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
            transaction = await sequelize.transaction();
            const existing = await posRepository.getTransactionById(normalizedTransactionId, { transaction, lock: true });
            if (!existing) throw providerRefundError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS transaction not found', 404);
            if (String(existing.status || '').toLowerCase() !== 'voided') {
                throw providerRefundError(DomainErrorCode.CONFLICT, 'Void the POS transaction before requesting a provider refund', 409);
            }

            const transactionDetails = assertOnlineProviderTransaction({ existing, locationId });
            const amount = round4(existing.total_amount);
            if (amount <= 0) throw providerRefundError(DomainErrorCode.CONFLICT, 'POS transaction amount must be greater than zero', 409);
            const requestHash = hashPayload({
                pos_transaction_id: normalizedTransactionId,
                payment_reference: transactionDetails.paymentReference,
                payment_session_reference: transactionDetails.sessionReference,
                shift_id: activeShiftId,
                terminal_id: terminalId,
                location_id: locationId,
                reason,
                provider_reason: providerReason,
                amount
            });
            const shift = activeShiftId
                ? await posRepository.getTerminalShiftById(activeShiftId, { transaction, lock: true })
                : null;
            if (activeShiftId) assertOwnedOpenShift({ shift, actorUserId, terminalId, locationId });
            const complianceDecision = await assertProviderRefundCompliance({ terminalId, user });
            const existingByIdempotency = await posRepository.findPosTransactionAdjustmentByIdempotencyKey(
                normalizedTransactionId,
                idempotencyKey,
                { transaction, lock: true }
            );
            if (existingByIdempotency) {
                if (String(existingByIdempotency.request_hash || '') !== requestHash) {
                    throw providerRefundError(DomainErrorCode.CONFLICT, 'Provider refund idempotency_key was already used with a different request', 409);
                }
                if (existingByIdempotency.adjustment_type !== 'provider_refund') {
                    throw providerRefundError(DomainErrorCode.CONFLICT, 'idempotency_key belongs to a different POS adjustment', 409);
                }
                if (existingByIdempotency.status === 'succeeded') {
                    const replayedTransaction = await posRepository.getTransactionById(normalizedTransactionId, { transaction });
                    await transaction.commit();
                    return ok({
                        transaction: toSerializable(replayedTransaction),
                        adjustment: existingByIdempotency,
                        idempotent_replay: true,
                        financial_outcome: buildOutcomeFromAdjustment(existingByIdempotency, amount)
                    });
                }
                if (existingByIdempotency.status === 'pending') replayPendingAdjustment = existingByIdempotency;
            }

            const adjustments = await posRepository.listPosTransactionAdjustmentsForTransaction(normalizedTransactionId, { transaction, lock: true });
            const providerAdjustments = getProviderAdjustment(adjustments);
            const completedAdjustment = providerAdjustments.find((adjustment) => adjustment.status === 'succeeded');
            if (completedAdjustment) throw providerRefundError(DomainErrorCode.CONFLICT, 'A provider refund has already been confirmed for this POS transaction', 409);
            const pendingAdjustment = providerAdjustments.find((adjustment) => (
                adjustment.status === 'pending'
                && Number(adjustment.pos_transaction_adjustment_id) !== Number(replayPendingAdjustment?.pos_transaction_adjustment_id)
            ));
            if (pendingAdjustment) throw providerRefundError(DomainErrorCode.CONFLICT, 'A provider refund is already pending for this POS transaction; retry the original request after provider reconciliation', 409, { reason_code: 'POS_PROVIDER_REFUND_ALREADY_PENDING' });

            prepared = {
                transaction: existing,
                transactionDetails,
                amount,
                requestHash,
                idempotencyKey,
                shift,
                complianceDecision,
                adjustment: replayPendingAdjustment,
                providerCallAllowed: !replayPendingAdjustment,
                providerRefundMarker: buildProviderRefundMarker({ transactionId: normalizedTransactionId, idempotencyKey })
            };
            await transaction.commit();
            transaction = null;
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            return fail(mapPosUseCaseError(error, 'Failed to prepare POS provider refund'));
        }

        let session;
        let verified;
        try {
            session = await verifyCommercePaymentSession({
                commercePaymentRepository,
                sessionReference: prepared.transactionDetails.sessionReference,
                transactionId: normalizedTransactionId,
                paymentReference: prepared.transactionDetails.paymentReference,
                amount: prepared.amount
            });
            verified = await verifyProviderPayment({
                paymongoService,
                paymentReference: prepared.transactionDetails.paymentReference,
                paymentType: prepared.transactionDetails.paymentType,
                amount: prepared.amount,
                session
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to verify POS provider refund identity'));
        }

        if (!prepared.adjustment) try {
            const prepareTransaction = await (dbStore.getStore()?.sequelize || dbStore.get('sequelize')).transaction();
            const locked = await posRepository.getTransactionById(normalizedTransactionId, { transaction: prepareTransaction, lock: true });
            if (!locked) throw providerRefundError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS transaction not found', 404);
            const adjustment = await posRepository.createPosTransactionAdjustment({
                adjustment_reference: `POS-PROVIDER-REFUND-${normalizedTransactionId}-${prepared.requestHash.slice(0, 8)}`.slice(0, 40),
                pos_transaction_id: normalizedTransactionId,
                original_cashier_id: parsePositiveInt(locked.cashier_id),
                original_shift_id: parsePositiveInt(locked.shift_id),
                original_terminal_id: locked.terminal_id || null,
                original_location_id: parsePositiveInt(locked.location_id),
                actor_user_id: actorUserId,
                actor_shift_id: activeShiftId || null,
                actor_terminal_id: terminalId || locked.terminal_id || null,
                actor_location_id: locationId || parsePositiveInt(locked.location_id),
                adjustment_type: 'provider_refund',
                tender_type: prepared.transactionDetails.paymentType,
                amount: prepared.amount,
                currency: 'PHP',
                status: 'pending',
                reason,
                idempotency_key: idempotencyKey,
                request_hash: prepared.requestHash,
                external_reference: null,
                provider: PROVIDER,
                provider_reference: null,
                provider_event_id: null,
                metadata: {
                    evidence_scope: 'pos_online_provider_refund',
                    provider_payment_id: prepared.transactionDetails.paymentReference,
                    payment_session_reference: prepared.transactionDetails.sessionReference,
                    provider_refund_marker: prepared.providerRefundMarker,
                    provider_call_state: 'calling',
                    payment_status_before_refund: prepared.transactionDetails.paymentStatus,
                    actor_shift_id: activeShiftId || null,
                    financial_outcome: buildFinancialOutcome({ amount: prepared.amount, state: 'pending' })
                }
            }, { transaction: prepareTransaction });
            if (!adjustment || String(adjustment.request_hash || '') !== prepared.requestHash) {
                throw providerRefundError(DomainErrorCode.CONFLICT, 'Provider refund evidence could not be prepared consistently', 409);
            }
            const updated = await posRepository.updateTransactionLifecycle(normalizedTransactionId, { payment_status: 'refund_pending' }, { transaction: prepareTransaction, lock: true });
            if (!updated) throw providerRefundError(DomainErrorCode.INTERNAL_ERROR, 'POS transaction payment status could not be updated for provider refund', 500);
            await posRepository.createAuditLog({
                user_id: actorUserId,
                entity_type: 'pos_transaction',
                entity_id: normalizedTransactionId,
                action: 'UPDATE',
                event_type: 'pos_provider_refund_pending',
                terminal_id: terminalId || locked.terminal_id || null,
                shift_id: activeShiftId || null,
                location_id: locked.location_id || null,
                reason,
                changes: {
                    event: 'pos_provider_refund_pending',
                    transaction_id: normalizedTransactionId,
                    provider: PROVIDER,
                    provider_payment_id: prepared.transactionDetails.paymentReference,
                    payment_session_reference: prepared.transactionDetails.sessionReference,
                    amount: prepared.amount,
                    actor_user_id: actorUserId,
                    actor_shift_id: activeShiftId || null,
                    adjustment_reference: adjustment.adjustment_reference
                }
            }, { transaction: prepareTransaction });
            await prepareTransaction.commit();
            prepared.adjustment = adjustment;
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to prepare POS provider refund'));
        }

        const existingProviderRefund = verified.refunds.find((refund) => (
            PROVIDER_REFUND_SUCCESS_STATUSES.has(refund.status)
            && Number(refund.amount) === toCentavos(prepared.amount)
        ));
        if (existingProviderRefund) {
            let recovery;
            try {
                recovery = await recoverCommerceRefundLedger({
                    commercePaymentRepository,
                    session,
                    providerRefund: existingProviderRefund,
                    providerRefundMarker: prepared.providerRefundMarker,
                    actor: `pos:${actorUserId}`,
                    reconcileCommercePaymentRefundState,
                    recordSucceededRevenueRefund
                });
            } catch (error) {
                return finalizeProviderRefundFailure({
                    posRepository,
                    prepared,
                    actorUserId,
                    terminalId,
                    activeShiftId,
                    reason,
                    error,
                    retryable: true
                });
            }
            if (!recovery) {
                return finalizeProviderRefundFailure({
                    posRepository,
                    prepared,
                    actorUserId,
                    terminalId,
                    activeShiftId,
                    reason,
                    error: new Error('Provider refund exists without a matching commerce refund ledger row'),
                    retryable: true
                });
            }
            return finalizeProviderRefund({
                posRepository,
                prepared,
                providerRefund: existingProviderRefund,
                state: 'completed',
                actorUserId,
                terminalId,
                activeShiftId,
                reason,
                session: recovery.session,
                commerceRefund: recovery.commerceRefund,
                idempotentRecovery: true
            });
        }

        const existingProviderPendingRefund = verified.refunds.find((refund) => (
            PROVIDER_REFUND_PENDING_STATUSES.has(String(refund.status || '').trim().toLowerCase())
            && Number(refund.amount) === toCentavos(prepared.amount)
        ));
        if (existingProviderPendingRefund) {
            return finalizeProviderRefund({
                posRepository,
                prepared,
                providerRefund: existingProviderPendingRefund,
                state: 'pending',
                actorUserId,
                terminalId,
                activeShiftId,
                reason,
                session,
                idempotentRecovery: true
            });
        }

        const existingProviderFailedRefund = verified.refunds.find((refund) => (
            PROVIDER_REFUND_FAILURE_STATUSES.has(String(refund.status || '').trim().toLowerCase())
            && Number(refund.amount) === toCentavos(prepared.amount)
        ));
        if (existingProviderFailedRefund && prepared.adjustment?.status !== 'failed') {
            return finalizeProviderRefund({
                posRepository,
                prepared,
                providerRefund: existingProviderFailedRefund,
                state: 'failed',
                actorUserId,
                terminalId,
                activeShiftId,
                reason,
                session,
                idempotentRecovery: true
            });
        }

        if (prepared.adjustment?.status === 'pending' && !prepared.providerCallAllowed) {
            return ok({
                transaction: toSerializable(prepared.transaction),
                adjustment: prepared.adjustment,
                idempotent_replay: true,
                financial_outcome: buildOutcomeFromAdjustment(prepared.adjustment, prepared.amount),
                provider_verification: {
                    provider: PROVIDER,
                    provider_payment_id: prepared.transactionDetails.paymentReference,
                    provider_refund_id: prepared.adjustment.provider_reference || null,
                    provider_refund_status: prepared.adjustment.metadata?.provider_refund_status || 'pending',
                    payment_session_reference: session.public_reference
                }
            });
        }

        let commerceResult;
        try {
            commerceResult = await createCommercePaymentRefundUseCase({
                paymentSessionId: prepared.transactionDetails.sessionReference,
                payload: {
                    amount_centavos: toCentavos(prepared.amount),
                    provider_reason: providerReason,
                    reason: providerReason,
                    notes: `${prepared.providerRefundMarker} ${reason}`.slice(0, 255),
                    refund_strategy: 'proportional'
                },
                actor: `pos:${actorUserId}`
            });
        } catch (error) {
            return finalizeProviderRefundFailure({
                posRepository,
                prepared,
                actorUserId,
                terminalId,
                activeShiftId,
                reason,
                error,
                retryable: true
            });
        }

        if (!commerceResult?.success || !commerceResult?.data?.refund) {
            return finalizeProviderRefundFailure({
                posRepository,
                prepared,
                actorUserId,
                terminalId,
                activeShiftId,
                reason,
                error: commerceResult?.error || new Error('Provider refund was not recorded'),
                retryable: false
            });
        }

        const commerceRefund = commerceResult.data.refund;
        const state = classifyProviderRefundStatus(commerceRefund.status);
        return finalizeProviderRefund({
            posRepository,
            prepared,
            providerRefund: {
                id: commerceRefund.provider_refund_id,
                status: commerceRefund.status,
                amount: toCentavos(prepared.amount),
                resource: null
            },
            state,
            actorUserId,
            terminalId,
            activeShiftId,
            reason,
            session,
            commerceRefund
        });
    };
};

const finalizeProviderRefund = async ({
    posRepository,
    prepared,
    providerRefund,
    state,
    actorUserId,
    terminalId,
    activeShiftId,
    reason,
    session,
    commerceRefund = null,
    idempotentRecovery = false
}) => {
    let transaction = null;
    try {
        transaction = await (dbStore.getStore()?.sequelize || dbStore.get('sequelize')).transaction();
        const locked = await posRepository.getTransactionById(prepared.transaction.pos_transaction_id, { transaction, lock: true });
        const adjustment = await posRepository.findPosTransactionAdjustmentByIdempotencyKey(
            prepared.transaction.pos_transaction_id,
            prepared.idempotencyKey,
            { transaction, lock: true }
        );
        const storedAdjustment = prepared.adjustment || adjustment;
        if (!storedAdjustment) throw providerRefundError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Provider refund adjustment not found', 404);
        const normalizedProviderStatus = String(providerRefund?.status || state).trim().toLowerCase();
        const providerRefundId = String(providerRefund?.id || '').trim() || null;
        const stateOutcome = buildFinancialOutcome({ amount: prepared.amount, state });
        const updatedAdjustment = await posRepository.updatePosTransactionAdjustment(
            storedAdjustment.pos_transaction_adjustment_id,
            {
                status: providerRefundAdjustmentStatus(state),
                provider_reference: providerRefundId,
                provider_event_id: providerEventId(providerRefundId, normalizedProviderStatus),
                approved_by: state === 'completed' ? actorUserId : null,
                approved_at: state === 'completed' ? new Date() : null,
                completed_at: state === 'completed' ? new Date() : null,
                failed_at: state === 'failed' ? new Date() : null,
                failure_code: state === 'failed' ? 'PROVIDER_REFUND_FAILED' : null,
                failure_reason: state === 'failed' ? 'PayMongo reported refund failure.' : null,
                metadata: {
                    ...(storedAdjustment.metadata || {}),
                    provider_call_state: state === 'completed' ? 'completed' : (state === 'failed' ? 'failed' : 'pending'),
                    provider_refund_status: normalizedProviderStatus,
                    provider_refund_id: providerRefundId,
                    idempotent_recovery: idempotentRecovery,
                    financial_outcome: stateOutcome
                }
            },
            { transaction, lock: true }
        );
        const updatedTransaction = await posRepository.updateTransactionLifecycle(
            prepared.transaction.pos_transaction_id,
            { payment_status: state === 'completed' ? 'refunded' : 'refund_pending' },
            { transaction, lock: true }
        );
        await posRepository.createAuditLog({
            user_id: actorUserId,
            entity_type: 'pos_transaction',
            entity_id: prepared.transaction.pos_transaction_id,
            action: 'UPDATE',
            event_type: state === 'completed' ? 'pos_provider_refund_completed' : (state === 'pending' ? 'pos_provider_refund_pending' : 'pos_provider_refund_failed'),
            terminal_id: terminalId || locked?.terminal_id || null,
            shift_id: activeShiftId || null,
            location_id: locked?.location_id || null,
            reason,
            changes: {
                event: state === 'completed' ? 'pos_provider_refund_completed' : (state === 'pending' ? 'pos_provider_refund_pending' : 'pos_provider_refund_failed'),
                transaction_id: prepared.transaction.pos_transaction_id,
                provider: PROVIDER,
                provider_payment_id: prepared.transactionDetails.paymentReference,
                provider_refund_id: providerRefundId,
                provider_refund_status: normalizedProviderStatus,
                amount: prepared.amount,
                actor_user_id: actorUserId,
                actor_shift_id: activeShiftId || null,
                adjustment_reference: updatedAdjustment?.adjustment_reference || storedAdjustment.adjustment_reference
            }
        }, { transaction });
        await transaction.commit();
        return ok({
            transaction: updatedTransaction,
            adjustment: updatedAdjustment,
            commerce_refund: commerceRefund,
            idempotent_replay: idempotentRecovery,
            financial_outcome: stateOutcome,
            provider_verification: {
                provider: PROVIDER,
                provider_payment_id: prepared.transactionDetails.paymentReference,
                provider_refund_id: providerRefundId,
                provider_refund_status: normalizedProviderStatus,
                payment_session_reference: session?.public_reference || prepared.transactionDetails.sessionReference
            }
        });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        return fail(mapPosUseCaseError(error, 'Failed to finalize POS provider refund'));
    }
};

const finalizeProviderRefundFailure = async ({
    posRepository,
    prepared,
    actorUserId,
    terminalId,
    activeShiftId,
    reason,
    error,
    retryable
}) => {
    let transaction = null;
    try {
        transaction = await (dbStore.getStore()?.sequelize || dbStore.get('sequelize')).transaction();
        const adjustment = await posRepository.findPosTransactionAdjustmentByIdempotencyKey(
            prepared.transaction.pos_transaction_id,
            prepared.idempotencyKey || prepared.adjustment?.idempotency_key,
            { transaction, lock: true }
        );
        if (!adjustment) throw providerRefundError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Provider refund adjustment not found', 404);
        const failureState = retryable ? 'pending' : 'failed';
        const failedOutcome = buildFinancialOutcome({ amount: prepared.amount, state: failureState });
        const updatedAdjustment = await posRepository.updatePosTransactionAdjustment(
            adjustment.pos_transaction_adjustment_id,
            {
                status: retryable ? 'pending' : 'failed',
                failure_code: retryable ? 'PROVIDER_REFUND_RETRYABLE_FAILURE' : 'PROVIDER_REFUND_FAILED',
                failure_reason: String(error?.message || 'Provider refund failed').slice(0, 500),
                metadata: {
                    ...(adjustment.metadata || {}),
                    provider_call_state: retryable ? 'retryable' : 'failed',
                    financial_outcome: failedOutcome
                }
            },
            { transaction, lock: true }
        );
        const updatedTransaction = await posRepository.updateTransactionLifecycle(
            prepared.transaction.pos_transaction_id,
            { payment_status: 'refund_pending' },
            { transaction, lock: true }
        );
        await posRepository.createAuditLog({
            user_id: actorUserId,
            entity_type: 'pos_transaction',
            entity_id: prepared.transaction.pos_transaction_id,
            action: 'UPDATE',
            event_type: retryable ? 'pos_provider_refund_retryable_failure' : 'pos_provider_refund_failed',
            terminal_id: terminalId || prepared.transaction.terminal_id || null,
            shift_id: activeShiftId || null,
            location_id: prepared.transaction.location_id || null,
            reason,
            changes: {
                event: retryable ? 'pos_provider_refund_retryable_failure' : 'pos_provider_refund_failed',
                transaction_id: prepared.transaction.pos_transaction_id,
                provider: PROVIDER,
                provider_payment_id: prepared.transactionDetails.paymentReference,
                amount: prepared.amount,
                actor_user_id: actorUserId,
                actor_shift_id: activeShiftId || null,
                error: String(error?.message || 'Provider refund failed').slice(0, 500)
            }
        }, { transaction });
        await transaction.commit();
        return ok({
            transaction: updatedTransaction,
            adjustment: updatedAdjustment,
            idempotent_replay: false,
            retryable: Boolean(retryable),
            financial_outcome: failedOutcome
        });
    } catch (finalizeError) {
        if (transaction && !transaction.finished) await transaction.rollback();
        return fail(mapPosUseCaseError(finalizeError, 'Failed to record POS provider refund failure'));
    }
};
