import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';

const VALIDATION_MESSAGE_PATTERN = /expired|invalid|not found|already/i;

const resolveDomainCodeFromStatus = (statusCode) => {
  if (statusCode === 401) return DomainErrorCode.AUTHENTICATION_FAILED;
  if (statusCode === 403) return DomainErrorCode.AUTHORIZATION_FAILED;
  if (statusCode === 404) return DomainErrorCode.RESOURCE_NOT_FOUND;
  if (statusCode === 409) return DomainErrorCode.CONFLICT;
  if (statusCode >= 400 && statusCode < 500) return DomainErrorCode.VALIDATION_FAILED;
  return DomainErrorCode.INTERNAL_ERROR;
};

export const mapAuthUseCaseError = (error, fallbackMessage) => {
  if (isDomainError(error)) {
    return error;
  }

  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : null;
  const codeFromStatus = statusCode ? resolveDomainCodeFromStatus(statusCode) : null;
  const hasValidationMessage = typeof error?.message === 'string'
    && VALIDATION_MESSAGE_PATTERN.test(error.message);

  const code = codeFromStatus
    || (hasValidationMessage ? DomainErrorCode.VALIDATION_FAILED : DomainErrorCode.INTERNAL_ERROR);

  return new DomainError(
    code,
    error?.message || fallbackMessage || 'Authentication operation failed',
    {
      details: error?.details || null,
      statusCode: statusCode || undefined
    }
  );
};
