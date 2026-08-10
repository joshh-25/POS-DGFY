import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPurchaseOrderUseCaseError } from './purchaseOrderUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

export const buildGetPurchaseOrderByIdUseCase = ({ purchaseOrderRepository }) => {
  return async ({ poId, valuationLocationId = null }) => {
    const normalizedPoId = parsePositiveInt(poId);
    if (!normalizedPoId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'poId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    const normalizedValuationLocationId = (
      valuationLocationId === null
      || valuationLocationId === undefined
      || valuationLocationId === ''
    )
      ? null
      : parsePositiveInt(valuationLocationId);

    if (
      valuationLocationId !== null
      && valuationLocationId !== undefined
      && valuationLocationId !== ''
      && normalizedValuationLocationId === null
    ) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'valuationLocationId must be a positive integer when provided',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await purchaseOrderRepository.getPurchaseOrderById(
        normalizedPoId,
        { valuationLocationId: normalizedValuationLocationId }
      );
      return ok(data);
    } catch (error) {
      return fail(mapPurchaseOrderUseCaseError(error, 'Failed to retrieve purchase order'));
    }
  };
};
