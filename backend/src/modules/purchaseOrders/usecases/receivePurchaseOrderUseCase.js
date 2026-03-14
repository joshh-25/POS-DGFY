import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPurchaseOrderUseCaseError } from './purchaseOrderUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const buildReceivePurchaseOrderUseCase = ({ purchaseOrderRepository }) => {
  return async ({ poId, receiptData, userId }) => {
    const normalizedPoId = parsePositiveInt(poId);
    const normalizedUserId = userId === undefined || userId === null ? null : parsePositiveInt(userId);

    if (!normalizedPoId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'poId must be a positive integer',
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

    if (!isPlainObject(receiptData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'receiptData must be an object',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await purchaseOrderRepository.receivePurchaseOrder(
        normalizedPoId,
        receiptData,
        normalizedUserId
      );
      return ok(data);
    } catch (error) {
      return fail(mapPurchaseOrderUseCaseError(error, 'Failed to receive purchase order'));
    }
  };
};
