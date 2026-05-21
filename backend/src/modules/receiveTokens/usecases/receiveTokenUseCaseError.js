import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';

const statusCodeToDomainErrorCode = (statusCode) => {
  if (statusCode === 401) return DomainErrorCode.AUTHENTICATION_FAILED;
  if (statusCode === 403) return DomainErrorCode.AUTHORIZATION_FAILED;
  if (statusCode === 404) return DomainErrorCode.RESOURCE_NOT_FOUND;
  if (statusCode === 409) return DomainErrorCode.CONFLICT;
  if (statusCode >= 400 && statusCode < 500) return DomainErrorCode.VALIDATION_FAILED;
  return DomainErrorCode.INTERNAL_ERROR;
};

export const mapReceiveTokenUseCaseError = (error, fallbackMessage) => {
  if (isDomainError(error)) {
    return error;
  }

  const message = error?.message || fallbackMessage || 'Receive token request failed';
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : undefined;
  const hasInvalidTokenMessage = /invalid|expired token/i.test(message);

  return new DomainError(
    hasInvalidTokenMessage ? DomainErrorCode.AUTHENTICATION_FAILED : statusCodeToDomainErrorCode(statusCode || 500),
    message,
    {
      statusCode: statusCode || (hasInvalidTokenMessage ? 401 : undefined),
      details: error?.details || null
    }
  );
};
