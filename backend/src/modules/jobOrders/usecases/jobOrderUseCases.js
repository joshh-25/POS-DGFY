import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapJobOrderUseCaseError } from './jobOrderUseCaseError.js';

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
    return fail(mapJobOrderUseCaseError(error, fallbackMessage));
  }
};

export const buildGetJobOrdersUseCase = ({ jobOrderService }) => {
  return async ({ query }) => {
    if (query !== undefined && !isPlainObject(query)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'query must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => jobOrderService.getJobOrders(query || {}),
      'Failed to retrieve job orders'
    );
  };
};

export const buildGetJobOrderByIdUseCase = ({ jobOrderService }) => {
  return async ({ jobOrderId }) => {
    const normalizedJobOrderId = parsePositiveInt(jobOrderId);
    if (!normalizedJobOrderId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'jobOrderId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => jobOrderService.getJobOrderById(normalizedJobOrderId),
      'Failed to retrieve job order'
    );
  };
};

export const buildCreateJobOrderUseCase = ({ jobOrderService }) => {
  return async ({ jobOrderData, userId }) => {
    const normalizedUserId = parsePositiveInt(userId);
    if (!normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (!isPlainObject(jobOrderData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'jobOrderData must be an object',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => jobOrderService.createJobOrder(jobOrderData, normalizedUserId),
      'Failed to create job order'
    );
  };
};

export const buildFinalizeJobOrderUseCase = ({ jobOrderService }) => {
  return async ({ jobOrderId, userId }) => {
    const normalizedJobOrderId = parsePositiveInt(jobOrderId);
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedJobOrderId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'jobOrderId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => jobOrderService.finalizeJobOrder(normalizedJobOrderId, normalizedUserId),
      'Failed to finalize job order'
    );
  };
};

export const buildCompleteJobOrderUseCase = ({ jobOrderService }) => {
  return async ({ jobOrderId, userId, completionData }) => {
    const normalizedJobOrderId = parsePositiveInt(jobOrderId);
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedJobOrderId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'jobOrderId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    if (completionData !== undefined && completionData !== null && !isPlainObject(completionData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'completionData must be an object when provided',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => jobOrderService.completeJobOrder(
        normalizedJobOrderId,
        normalizedUserId,
        completionData?.expiry_date,
        completionData?.notes,
        completionData?.quantity_produced,
        completionData?.quality_check
      ),
      'Failed to complete job order'
    );
  };
};

export const buildArchiveJobOrderUseCase = ({ jobOrderService }) => {
  return async ({ jobOrderId, userId }) => {
    const normalizedJobOrderId = parsePositiveInt(jobOrderId);
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedJobOrderId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'jobOrderId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => jobOrderService.archiveJobOrder(normalizedJobOrderId, normalizedUserId),
      'Failed to archive job order'
    );
  };
};

export const buildRestoreJobOrderUseCase = ({ jobOrderService }) => {
  return async ({ jobOrderId }) => {
    const normalizedJobOrderId = parsePositiveInt(jobOrderId);
    if (!normalizedJobOrderId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'jobOrderId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    return withServiceExecution(
      () => jobOrderService.restoreJobOrder(normalizedJobOrderId),
      'Failed to restore job order'
    );
  };
};
