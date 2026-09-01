import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const normalizeTimestamp = (value) => {
    if (value == null || value === '') return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeState = (value) => String(value || '').trim().toLowerCase() || null;

export const assertMobilePosExpectedTransactionState = ({ transaction, payload = {}, operation = 'mutation' }) => {
    const expectedVersion = normalizeTimestamp(payload.expected_server_version);
    const actualVersion = normalizeTimestamp(transaction?.updated_at);
    const expectedStatus = normalizeState(payload.expected_status);
    const actualStatus = normalizeState(transaction?.status);
    const expectedPaymentStatus = normalizeState(payload.expected_payment_status);
    const actualPaymentStatus = normalizeState(transaction?.payment_status);

    const versionChanged = expectedVersion && actualVersion && expectedVersion !== actualVersion;
    const statusChanged = expectedStatus && expectedStatus !== actualStatus;
    const paymentChanged = expectedPaymentStatus && expectedPaymentStatus !== actualPaymentStatus;
    if (!versionChanged && !statusChanged && !paymentChanged) return;

    throw new DomainError(
        DomainErrorCode.CONFLICT,
        'The POS transaction changed on the server before the offline request was replayed',
        {
            statusCode: 409,
            details: {
                reason_code: 'MOBILE_TRANSACTION_VERSION_CONFLICT',
                operation,
                expected_server_version: expectedVersion,
                actual_server_version: actualVersion,
                expected_status: expectedStatus,
                actual_status: actualStatus,
                expected_payment_status: expectedPaymentStatus,
                actual_payment_status: actualPaymentStatus
            }
        }
    );
};
