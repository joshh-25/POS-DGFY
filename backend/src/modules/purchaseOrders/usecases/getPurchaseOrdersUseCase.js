import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPurchaseOrderUseCaseError } from './purchaseOrderUseCaseError.js';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const buildGetPurchaseOrdersUseCase = ({ purchaseOrderRepository }) => {
  return async ({ queryParams }) => {
    if (queryParams !== undefined && !isPlainObject(queryParams)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'queryParams must be an object',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await purchaseOrderRepository.getPurchaseOrders(queryParams || {});
      return ok(data);
    } catch (error) {
      return fail(mapPurchaseOrderUseCaseError(error, 'Failed to retrieve purchase orders'));
    }
  };
};
