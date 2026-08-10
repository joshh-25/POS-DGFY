import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPurchaseOrderUseCaseError } from './purchaseOrderUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const buildCreatePurchaseOrderUseCase = ({ purchaseOrderRepository }) => {
  return async ({ poData, userId }) => {
    const normalizedUserId = parsePositiveInt(userId);
    if (!normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (!isPlainObject(poData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'poData must be an object',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await purchaseOrderRepository.createPurchaseOrder(poData, normalizedUserId);
      return ok(data);
    } catch (error) {
      return fail(mapPurchaseOrderUseCaseError(error, 'Failed to create purchase order'));
    }
  };
};
