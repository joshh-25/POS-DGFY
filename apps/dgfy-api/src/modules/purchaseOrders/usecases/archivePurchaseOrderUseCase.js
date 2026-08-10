import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPurchaseOrderUseCaseError } from './purchaseOrderUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

export const buildArchivePurchaseOrderUseCase = ({ purchaseOrderRepository }) => {
  return async ({ poId, userId }) => {
    const normalizedPoId = parsePositiveInt(poId);
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedPoId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'poId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await purchaseOrderRepository.archivePurchaseOrder(normalizedPoId, normalizedUserId);
      return ok(data);
    } catch (error) {
      return fail(mapPurchaseOrderUseCaseError(error, 'Failed to archive purchase order'));
    }
  };
};
