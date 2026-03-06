import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';

const statusCodeToDomainErrorCode = (statusCode) => {
  if (statusCode === 401) return DomainErrorCode.AUTHENTICATION_FAILED;
  if (statusCode === 403) return DomainErrorCode.AUTHORIZATION_FAILED;
  if (statusCode === 404) return DomainErrorCode.RESOURCE_NOT_FOUND;
  if (statusCode === 409) return DomainErrorCode.CONFLICT;
  if (statusCode >= 400 && statusCode < 500) return DomainErrorCode.VALIDATION_FAILED;
  return DomainErrorCode.INTERNAL_ERROR;
};

export const mapAlertUseCaseError = (error, fallbackMessage) => {
  if (isDomainError(error)) {
    return error;
  }

  const message = error?.message || fallbackMessage || 'Alert request failed';
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : undefined;

  return new DomainError(
    statusCodeToDomainErrorCode(statusCode || 500),
    message,
    {
      statusCode: statusCode || undefined,
      details: error?.details || null
    }
  );
};
