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
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedPoId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'poId and userId must be positive integers',
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
