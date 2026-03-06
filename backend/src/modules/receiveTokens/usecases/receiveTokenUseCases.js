import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapReceiveTokenUseCaseError } from './receiveTokenUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const buildGenerateTokenUseCase = ({ receiveTokenService }) => {
  return async ({ orderType, orderId, userId, expiryDays }) => {
    const normalizedOrderId = parsePositiveInt(orderId);
    const normalizedUserId = parsePositiveInt(userId);
    const normalizedExpiryDays = expiryDays === undefined ? undefined : parsePositiveInt(expiryDays);

    if (!['PO', 'JO'].includes(orderType)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'orderType must be PO or JO',
        { statusCode: 400 }
      ));
    }

    if (!normalizedOrderId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'orderId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    if (expiryDays !== undefined && !normalizedExpiryDays) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'expiryDays must be a positive integer when provided',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await receiveTokenService.generateToken(
        orderType,
        normalizedOrderId,
        normalizedUserId,
        normalizedExpiryDays
      );
      return ok(data);
    } catch (error) {
      return fail(mapReceiveTokenUseCaseError(error, 'Failed to generate receive token'));
    }
  };
};

export const buildValidateTokenUseCase = ({ receiveTokenService }) => {
  return async ({ token }) => {
    if (!token || typeof token !== 'string') {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'token is required',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await receiveTokenService.validateToken(token);
      return ok(data);
    } catch (error) {
      return fail(mapReceiveTokenUseCaseError(error, 'Failed to validate token'));
    }
  };
};

export const buildReceiveViaTokenUseCase = ({ receiveTokenService }) => {
  return async ({ token, payload }) => {
    if (!token || typeof token !== 'string') {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'token is required',
        { statusCode: 400 }
      ));
    }

    if (!isPlainObject(payload)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'payload must be an object',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await receiveTokenService.receiveViaToken(token, payload);
      return ok(data);
    } catch (error) {
      return fail(mapReceiveTokenUseCaseError(error, 'Failed to receive via token'));
    }
  };
};

export const buildMarkTokenUsedUseCase = ({ receiveTokenService }) => {
  return async ({ tokenId, userId }) => {
    const normalizedTokenId = parsePositiveInt(tokenId);
    const normalizedUserId = userId === undefined || userId === null ? null : parsePositiveInt(userId);

    if (!normalizedTokenId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'tokenId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (userId !== undefined && userId !== null && !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer when provided',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await receiveTokenService.markTokenUsed(normalizedTokenId, normalizedUserId);
      return ok(data ?? undefined);
    } catch (error) {
      return fail(mapReceiveTokenUseCaseError(error, 'Failed to mark token as used'));
    }
  };
};
