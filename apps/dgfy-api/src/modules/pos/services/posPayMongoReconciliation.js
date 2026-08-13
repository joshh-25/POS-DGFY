const PAYMENT_REFERENCE_PATTERN = /^pay_[A-Za-z0-9]+$/;

const toCentavos = (value) => Math.round((Number(value) || 0) * 100);

const getAttributes = (resource = {}) => resource?.attributes || resource || {};

const getMetadata = (resource = {}) => {
    const attributes = getAttributes(resource);
    return attributes.metadata
        || attributes.payment_intent?.attributes?.metadata
        || attributes.payment_intent?.metadata
        || {};
};

const normalizeMethod = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'paymaya') return 'maya';
    if (normalized === 'dob' || normalized.startsWith('dob_') || normalized.includes('bank')) return 'bank_transfer';
    return normalized;
};

const getPaymentMethod = (resource = {}) => {
    const attributes = getAttributes(resource);
    return normalizeMethod(
        attributes.source?.type
        || attributes.payment_method_used
        || attributes.payment_method?.attributes?.type
        || attributes.payment_method?.type
    );
};

const getRefunds = (resource = {}) => {
    const attributes = getAttributes(resource);
    const source = Array.isArray(attributes.refunds?.data)
        ? attributes.refunds.data
        : (Array.isArray(attributes.refunds) ? attributes.refunds : []);

    return source.map((refund) => {
        const refundAttributes = getAttributes(refund);
        return {
            id: String(refund?.id || refundAttributes.id || '').trim(),
            status: String(refundAttributes.status || '').trim().toLowerCase(),
            amount: Number(refundAttributes.amount || 0),
            updated_at: refundAttributes.updated_at || refundAttributes.created_at || null
        };
    });
};

const toProviderDate = (value) => {
    if (!value) return new Date();
    const timestamp = Number(value);
    const date = Number.isFinite(timestamp)
        ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp)
        : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
};

const reconciliationFailure = (reasonCode, reason, details = {}) => ({
    reconciled: false,
    reason_code: reasonCode,
    reason,
    details
});

export const createPosPayMongoReconciler = ({ paymongoService } = {}) => async ({ session, allocation } = {}) => {
    if (!paymongoService || typeof paymongoService.getPayment !== 'function') {
        return reconciliationFailure(
            'PAYMENT_PROVIDER_RECONCILIATION_UNAVAILABLE',
            'PayMongo reconciliation is unavailable.'
        );
    }

    if (String(allocation?.payment_provider || '').trim().toLowerCase() !== 'paymongo') {
        return reconciliationFailure(
            'PAYMENT_PROVIDER_NOT_SUPPORTED',
            'This allocation is not assigned to the PayMongo provider.'
        );
    }

    const paymentReference = String(allocation?.payment_reference || '').trim();
    if (!PAYMENT_REFERENCE_PATTERN.test(paymentReference)) {
        return reconciliationFailure(
            'PAYMENT_PROVIDER_REFERENCE_INVALID',
            'A valid PayMongo payment ID is required for reconciliation.'
        );
    }

    const payment = await paymongoService.getPayment(paymentReference);
    if (!payment) {
        return reconciliationFailure('PAYMENT_PROVIDER_PAYMENT_NOT_FOUND', 'PayMongo payment was not found.');
    }

    const paymentId = String(payment.id || '').trim();
    const attributes = getAttributes(payment);
    if (paymentId !== paymentReference) {
        return reconciliationFailure(
            'PAYMENT_PROVIDER_REFERENCE_MISMATCH',
            'PayMongo returned a different payment identity.'
        );
    }

    const metadata = getMetadata(payment);
    const expectedSessionReference = String(session?.session_reference || '').trim();
    const expectedAllocationReference = String(allocation?.allocation_reference || '').trim();
    const providerSessionReference = String(
        metadata.pos_payment_session_reference || metadata.pos_payment_session || ''
    ).trim();
    const providerAllocationReference = String(
        metadata.pos_payment_allocation_reference || metadata.pos_payment_allocation || ''
    ).trim();
    if (!expectedSessionReference
        || !expectedAllocationReference
        || providerSessionReference !== expectedSessionReference
        || providerAllocationReference !== expectedAllocationReference) {
        return reconciliationFailure(
            'PAYMENT_PROVIDER_SCOPE_MISMATCH',
            'PayMongo payment metadata does not match this POS payment allocation.'
        );
    }

    const currency = String(attributes.currency || '').trim().toUpperCase();
    const expectedAmount = toCentavos(allocation?.applied_amount);
    const providerAmount = Number(attributes.amount || 0);
    if (currency !== 'PHP' || expectedAmount <= 0 || providerAmount !== expectedAmount) {
        return reconciliationFailure(
            'PAYMENT_PROVIDER_AMOUNT_MISMATCH',
            'PayMongo payment amount or currency does not match this allocation.',
            { expected_amount_centavos: expectedAmount, provider_amount_centavos: providerAmount, currency }
        );
    }

    const providerMethod = getPaymentMethod(payment);
    const expectedMethod = normalizeMethod(allocation?.payment_method);
    if (!providerMethod || providerMethod !== expectedMethod) {
        return reconciliationFailure(
            'PAYMENT_PROVIDER_METHOD_MISMATCH',
            'PayMongo payment method does not match this allocation.',
            { expected_method: expectedMethod, provider_method: providerMethod || null }
        );
    }

    if (String(attributes.status || '').trim().toLowerCase() !== 'paid') {
        return reconciliationFailure(
            'PAYMENT_PROVIDER_NOT_PAID',
            'PayMongo has not reported this payment as paid.'
        );
    }

    const successfulRefunds = getRefunds(payment).filter((refund) => (
        ['succeeded', 'success', 'refunded'].includes(refund.status) && refund.id && refund.amount > 0
    ));
    const refundedAmount = successfulRefunds.reduce((sum, refund) => sum + refund.amount, 0);
    if (refundedAmount > 0 && refundedAmount < expectedAmount) {
        return reconciliationFailure(
            'PAYMENT_PROVIDER_PARTIAL_REFUND_REQUIRES_REVIEW',
            'PayMongo reported a partial refund that cannot automatically reverse one POS allocation.',
            { expected_amount_centavos: expectedAmount, refunded_amount_centavos: refundedAmount }
        );
    }

    const paidAt = toProviderDate(attributes.paid_at || attributes.created_at);
    const paymentEventId = `paymongo:payment:${paymentId}:paid`;
    if (refundedAmount >= expectedAmount) {
        const refundIds = successfulRefunds.map((refund) => refund.id).sort();
        const refundedAt = successfulRefunds.reduce((latest, refund) => {
            const value = toProviderDate(refund.updated_at);
            return value > latest ? value : latest;
        }, paidAt);
        return {
            reconciled: true,
            action: 'reverse',
            provider_event_id: paymentEventId,
            provider_confirmed_at: paidAt,
            provider_refund_ids: refundIds,
            provider_refund_event_id: `paymongo:refund:${refundIds.join('+')}:succeeded`,
            provider_refund_status: 'succeeded',
            provider_refunded_at: refundedAt
        };
    }

    return {
        reconciled: true,
        action: 'confirm',
        provider_event_id: paymentEventId,
        provider_confirmed_at: paidAt
    };
};

export default createPosPayMongoReconciler;
