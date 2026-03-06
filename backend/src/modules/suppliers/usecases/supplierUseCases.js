import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapSupplierUseCaseError } from './supplierUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const buildGetSuppliersUseCase = ({ supplierService }) => {
  return async ({ query }) => {
    if (query !== undefined && !isPlainObject(query)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'query must be an object',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await supplierService.getSuppliers(query || {});
      return ok(data);
    } catch (error) {
      return fail(mapSupplierUseCaseError(error, 'Failed to retrieve suppliers'));
    }
  };
};

export const buildGetSupplierByIdUseCase = ({ supplierService }) => {
  return async ({ supplierId }) => {
    const normalizedSupplierId = parsePositiveInt(supplierId);
    if (!normalizedSupplierId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'supplierId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await supplierService.getSupplierById(normalizedSupplierId);
      return ok(data);
    } catch (error) {
      return fail(mapSupplierUseCaseError(error, 'Failed to retrieve supplier'));
    }
  };
};

export const buildCreateSupplierUseCase = ({ supplierService }) => {
  return async ({ supplierData, userId }) => {
    const normalizedUserId = userId === undefined || userId === null ? null : parsePositiveInt(userId);
    if (userId !== undefined && userId !== null && !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (!isPlainObject(supplierData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'supplierData must be an object',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await supplierService.createSupplier(supplierData, normalizedUserId);
      return ok(data);
    } catch (error) {
      return fail(mapSupplierUseCaseError(error, 'Failed to create supplier'));
    }
  };
};

export const buildUpdateSupplierUseCase = ({ supplierService }) => {
  return async ({ supplierId, supplierData, userId }) => {
    const normalizedSupplierId = parsePositiveInt(supplierId);
    const normalizedUserId = userId === undefined || userId === null ? null : parsePositiveInt(userId);

    if (!normalizedSupplierId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'supplierId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (userId !== undefined && userId !== null && !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (!isPlainObject(supplierData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'supplierData must be an object',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await supplierService.updateSupplier(normalizedSupplierId, supplierData, normalizedUserId);
      return ok(data);
    } catch (error) {
      return fail(mapSupplierUseCaseError(error, 'Failed to update supplier'));
    }
  };
};

export const buildFinalizeSupplierUseCase = ({ supplierService }) => {
  return async ({ supplierId, userId }) => {
    const normalizedSupplierId = parsePositiveInt(supplierId);
    const normalizedUserId = userId === undefined || userId === null ? null : parsePositiveInt(userId);

    if (!normalizedSupplierId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'supplierId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (userId !== undefined && userId !== null && !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await supplierService.finalizeSupplier(normalizedSupplierId, normalizedUserId);
      return ok(data);
    } catch (error) {
      return fail(mapSupplierUseCaseError(error, 'Failed to finalize supplier'));
    }
  };
};

export const buildAddSupplierItemUseCase = ({ supplierService }) => {
  return async ({ supplierId, supplierItemData }) => {
    const normalizedSupplierId = parsePositiveInt(supplierId);

    if (!normalizedSupplierId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'supplierId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (!isPlainObject(supplierItemData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'supplierItemData must be an object',
        { statusCode: 400 }
      ));
    }

    if (!parsePositiveInt(supplierItemData.item_id)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'supplierItemData.item_id must be a positive integer',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await supplierService.addSupplierItem(normalizedSupplierId, supplierItemData);
      return ok(data);
    } catch (error) {
      return fail(mapSupplierUseCaseError(error, 'Failed to add supplier item'));
    }
  };
};

export const buildDeleteSupplierUseCase = ({ supplierService }) => {
  return async ({ supplierId, userId }) => {
    const normalizedSupplierId = parsePositiveInt(supplierId);
    const normalizedUserId = parsePositiveInt(userId);

    if (!normalizedSupplierId || !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'supplierId and userId must be positive integers',
        { statusCode: 400 }
      ));
    }

    try {
      await supplierService.deleteSupplier(normalizedSupplierId, normalizedUserId);
      return ok(null);
    } catch (error) {
      return fail(mapSupplierUseCaseError(error, 'Failed to delete supplier'));
    }
  };
};
