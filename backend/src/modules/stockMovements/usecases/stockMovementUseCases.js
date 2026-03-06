import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapStockMovementUseCaseError } from './stockMovementUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const withServiceExecution = async (fn, fallbackMessage) => {
  try {
    const data = await fn();
    return ok(data);
  } catch (error) {
    return fail(mapStockMovementUseCaseError(error, fallbackMessage));
  }
};

export const buildGetStockMovementsUseCase = ({ stockMovementService }) => {
  return async ({ query }) => {
    if (query !== undefined && !isPlainObject(query)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'query must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => stockMovementService.getStockMovements(query || {}),
      'Failed to retrieve stock movements'
    );
  };
};

export const buildGetMovementByIdUseCase = ({ stockMovementService }) => {
  return async ({ movementId }) => {
    const normalizedMovementId = parsePositiveInt(movementId);
    if (!normalizedMovementId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'movementId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => stockMovementService.getMovementById(normalizedMovementId),
      'Failed to retrieve stock movement'
    );
  };
};

export const buildGetMovementStatsUseCase = ({ stockMovementService }) => {
  return async ({ query }) => {
    if (query !== undefined && !isPlainObject(query)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'query must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => stockMovementService.getMovementStats(query || {}),
      'Failed to retrieve stock movement stats'
    );
  };
};

export const buildCreateStockMovementUseCase = ({ stockMovementService }) => {
  return async ({ movementData, userId }) => {
    const normalizedUserId = parsePositiveInt(userId);
    if (!normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (!isPlainObject(movementData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'movementData must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => stockMovementService.createStockMovement(movementData, normalizedUserId),
      'Failed to create stock movement'
    );
  };
};

export const buildVoidMovementUseCase = ({ stockMovementService }) => {
  return async ({ movementId, userId, reason }) => {
    const normalizedMovementId = parsePositiveInt(movementId);
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedMovementId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'movementId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Reason is required',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => stockMovementService.voidMovement(normalizedMovementId, normalizedUserId, reason.trim()),
      'Failed to void stock movement'
    );
  };
};

export const buildExportMovementsUseCase = ({ stockMovementService }) => {
  return async ({ query }) => {
    if (query !== undefined && !isPlainObject(query)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'query must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => stockMovementService.exportMovements(query || {}),
      'Failed to export stock movements'
    );
  };
};

export const buildCreateBulkMovementsUseCase = ({ stockMovementService }) => {
  return async ({ movements, userId }) => {
    const normalizedUserId = parsePositiveInt(userId);
    if (!normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (!Array.isArray(movements) || movements.length === 0) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'movements must be a non-empty array',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => stockMovementService.createBulkMovements(movements, normalizedUserId),
      'Failed to create bulk stock movements'
    );
  };
};
