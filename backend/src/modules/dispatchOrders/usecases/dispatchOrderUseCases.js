import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapDispatchOrderUseCaseError } from './dispatchOrderUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const parseOptionalPositiveInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return parsePositiveInt(value);
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const withServiceExecution = async (fn, fallbackMessage) => {
  try {
    const data = await fn();
    return ok(data);
  } catch (error) {
    return fail(mapDispatchOrderUseCaseError(error, fallbackMessage));
  }
};

export const buildGetDispatchOrdersUseCase = ({ dispatchOrderService }) => {
  return async ({ query }) => {
    if (query !== undefined && !isPlainObject(query)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'query must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.getDispatchOrders(query || {}),
      'Failed to retrieve dispatch orders'
    );
  };
};

export const buildGetDispatchOrderByIdUseCase = ({ dispatchOrderService }) => {
  return async ({ dispatchOrderId }) => {
    const normalizedDispatchOrderId = parsePositiveInt(dispatchOrderId);
    if (!normalizedDispatchOrderId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'dispatchOrderId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.getDispatchOrderById(normalizedDispatchOrderId),
      'Failed to retrieve dispatch order'
    );
  };
};

export const buildGetDispatchStatsUseCase = ({ dispatchOrderService }) => {
  return async ({ query }) => {
    if (query !== undefined && !isPlainObject(query)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'query must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.getDispatchStats(query || {}),
      'Failed to retrieve dispatch stats'
    );
  };
};

export const buildExportDispatchOrdersUseCase = ({ dispatchOrderService }) => {
  return async ({ query }) => {
    if (query !== undefined && !isPlainObject(query)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'query must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.exportDispatchOrders(query || {}),
      'Failed to export dispatch orders'
    );
  };
};

export const buildCreateDispatchOrderUseCase = ({ dispatchOrderService }) => {
  return async ({ dispatchOrderData, userId }) => {
    const normalizedUserId = parsePositiveInt(userId);
    if (!normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (!isPlainObject(dispatchOrderData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'dispatchOrderData must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.createDispatchOrder(dispatchOrderData, normalizedUserId),
      'Failed to create dispatch order'
    );
  };
};

export const buildUpdateDispatchOrderUseCase = ({ dispatchOrderService }) => {
  return async ({ dispatchOrderId, dispatchOrderData, userId }) => {
    const normalizedDispatchOrderId = parsePositiveInt(dispatchOrderId);
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedDispatchOrderId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'dispatchOrderId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    if (!isPlainObject(dispatchOrderData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'dispatchOrderData must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.updateDispatchOrder(
        normalizedDispatchOrderId,
        dispatchOrderData,
        normalizedUserId
      ),
      'Failed to update dispatch order'
    );
  };
};

export const buildConfirmDispatchOrderUseCase = ({ dispatchOrderService }) => {
  return async ({ dispatchOrderId, userId }) => {
    const normalizedDispatchOrderId = parsePositiveInt(dispatchOrderId);
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedDispatchOrderId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'dispatchOrderId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.confirmDispatchOrder(normalizedDispatchOrderId, normalizedUserId),
      'Failed to confirm dispatch order'
    );
  };
};

export const buildDispatchLinesUseCase = ({ dispatchOrderService }) => {
  return async ({ dispatchOrderId, lines, userId, locationId = null }) => {
    const normalizedDispatchOrderId = parsePositiveInt(dispatchOrderId);
    const normalizedUserId = parsePositiveInt(userId);
    const normalizedLocationId = parseOptionalPositiveInt(locationId);

    if (!normalizedDispatchOrderId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'dispatchOrderId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    if (!Array.isArray(lines) || lines.length === 0) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'lines must be a non-empty array',
        { statusCode: 400 }
      ));
    }

    if (locationId !== undefined && locationId !== null && locationId !== '' && !normalizedLocationId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'locationId must be a positive integer when provided',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.dispatchLines(
        normalizedDispatchOrderId,
        lines,
        normalizedUserId,
        normalizedLocationId
      ),
      'Failed to execute dispatch lines'
    );
  };
};

export const buildCancelDispatchOrderUseCase = ({ dispatchOrderService }) => {
  return async ({ dispatchOrderId, userId, reason }) => {
    const normalizedDispatchOrderId = parsePositiveInt(dispatchOrderId);
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedDispatchOrderId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'dispatchOrderId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    if (
      reason !== undefined
      && reason !== null
      && (typeof reason !== 'string' || reason.trim().length === 0)
    ) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'reason must be a non-empty string when provided',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.cancelDispatchOrder(
        normalizedDispatchOrderId,
        normalizedUserId,
        reason?.trim()
      ),
      'Failed to cancel dispatch order'
    );
  };
};

export const buildGetEarningsReportUseCase = ({ dispatchOrderService }) => {
  return async ({ query }) => {
    if (query !== undefined && !isPlainObject(query)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'query must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.getEarningsReport(query || {}),
      'Failed to retrieve earnings report'
    );
  };
};

export const buildArchiveDispatchOrderUseCase = ({ dispatchOrderService }) => {
  return async ({ dispatchOrderId, userId }) => {
    const normalizedDispatchOrderId = parsePositiveInt(dispatchOrderId);
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedDispatchOrderId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'dispatchOrderId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.archiveDispatchOrder(normalizedDispatchOrderId, normalizedUserId),
      'Failed to archive dispatch order'
    );
  };
};

export const buildUpdateLineSalePriceUseCase = ({ dispatchOrderService }) => {
  return async ({ doId, lineId, salePrice }) => {
    const parsedDoId   = parseInt(doId, 10);
    const parsedLineId = parseInt(lineId, 10);

    if (isNaN(parsedDoId) || parsedDoId <= 0 || isNaN(parsedLineId) || parsedLineId <= 0) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'doId and lineId must be positive integers',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => dispatchOrderService.updateLineSalePrice(parsedDoId, parsedLineId, salePrice ?? null),
      'Failed to update line sale price'
    );
  };
};
