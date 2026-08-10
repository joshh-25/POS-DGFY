import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPurchaseOrderUseCaseError } from './purchaseOrderUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

export const buildRestorePurchaseOrderUseCase = ({ purchaseOrderRepository }) => {
  return async ({ poId }) => {
    const normalizedPoId = parsePositiveInt(poId);
    if (!normalizedPoId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'poId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await purchaseOrderRepository.restorePurchaseOrder(normalizedPoId);
      return ok(data);
    } catch (error) {
      return fail(mapPurchaseOrderUseCaseError(error, 'Failed to restore purchase order'));
    }
  };
};
