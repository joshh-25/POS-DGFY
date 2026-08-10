import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';

const NOT_FOUND_PATTERN = /not found/i;

const resolveDomainCodeFromStatus = (statusCode) => {
    if (statusCode === 401) return DomainErrorCode.AUTHENTICATION_FAILED;
    if (statusCode === 403) return DomainErrorCode.AUTHORIZATION_FAILED;
    if (statusCode === 404) return DomainErrorCode.RESOURCE_NOT_FOUND;
    if (statusCode === 409) return DomainErrorCode.CONFLICT;
    if (statusCode >= 400 && statusCode < 500) return DomainErrorCode.VALIDATION_FAILED;
    return DomainErrorCode.INTERNAL_ERROR;
};

export const mapSettingsUseCaseError = (error, fallbackMessage) => {
    if (isDomainError(error)) {
        return error;
    }

    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : null;
    const codeFromStatus = statusCode ? resolveDomainCodeFromStatus(statusCode) : null;
    const hasNotFoundMessage = typeof error?.message === 'string'
        && NOT_FOUND_PATTERN.test(error.message);

    const code = hasNotFoundMessage
        ? DomainErrorCode.RESOURCE_NOT_FOUND
        : (codeFromStatus || DomainErrorCode.INTERNAL_ERROR);

    return new DomainError(
        code,
        error?.message || fallbackMessage || 'Settings operation failed',
        {
            details: error?.details || null,
            statusCode: statusCode || undefined
        }
    );
};
