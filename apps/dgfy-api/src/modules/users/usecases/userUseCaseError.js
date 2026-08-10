import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';

const statusCodeToDomainErrorCode = (statusCode) => {
  if (statusCode === 401) return DomainErrorCode.AUTHENTICATION_FAILED;
  if (statusCode === 403) return DomainErrorCode.AUTHORIZATION_FAILED;
  if (statusCode === 404) return DomainErrorCode.RESOURCE_NOT_FOUND;
  if (statusCode === 409) return DomainErrorCode.CONFLICT;
  if (statusCode >= 400 && statusCode < 500) return DomainErrorCode.VALIDATION_FAILED;
  return DomainErrorCode.INTERNAL_ERROR;
};

export const mapUserUseCaseError = (error, fallbackMessage) => {
  if (isDomainError(error)) {
    return error;
  }

  const message = error?.message || fallbackMessage || 'User request failed';
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : undefined;
  const hasNotFoundMessage = /not found/i.test(message);

  return new DomainError(
    hasNotFoundMessage ? DomainErrorCode.RESOURCE_NOT_FOUND : statusCodeToDomainErrorCode(statusCode || 500),
    message,
    {
      statusCode: statusCode || (hasNotFoundMessage ? 404 : undefined),
      details: error?.details || null
    }
  );
};
