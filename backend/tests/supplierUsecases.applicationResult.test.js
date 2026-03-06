import { jest } from '@jest/globals';
import {
  buildGetSupplierByIdUseCase,
  buildCreateSupplierUseCase,
  buildAddSupplierItemUseCase,
  buildDeleteSupplierUseCase
} from '../src/modules/suppliers/usecases/supplierUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('supplier use-cases application result contract', () => {
  it('validates supplierId for getSupplierById', async () => {
    const useCase = buildGetSupplierByIdUseCase({
      supplierService: { getSupplierById: jest.fn() }
    });

    const result = await useCase({ supplierId: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('createSupplier wraps service result in success envelope', async () => {
    const createSupplier = jest.fn().mockResolvedValue({
      supplier_id: 88,
      name: 'North Star Foods',
      status: 'draft'
    });
    const useCase = buildCreateSupplierUseCase({
      supplierService: { createSupplier }
    });

    const payload = { name: 'North Star Foods', status: 'draft' };
    const result = await useCase({ supplierData: payload, userId: '5' });

    expect(createSupplier).toHaveBeenCalledWith(payload, 5);
    expect(result).toEqual({
      success: true,
      data: { supplier_id: 88, name: 'North Star Foods', status: 'draft' },
      error: null,
      message: null
    });
  });

  it('addSupplierItem maps conflict errors from supplier service', async () => {
    const conflictError = new Error('Item already exists for this supplier');
    conflictError.statusCode = 409;

    const useCase = buildAddSupplierItemUseCase({
      supplierService: { addSupplierItem: jest.fn().mockRejectedValue(conflictError) }
    });

    const result = await useCase({
      supplierId: '12',
      supplierItemData: { item_id: 9, moq: 3, price_per_unit: 4.25 }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    expect(result.error.statusCode).toBe(409);
  });

  it('deleteSupplier normalizes ids and returns null success payload', async () => {
    const deleteSupplier = jest.fn().mockResolvedValue(true);
    const useCase = buildDeleteSupplierUseCase({
      supplierService: { deleteSupplier }
    });

    const result = await useCase({ supplierId: '9', userId: '4' });
    expect(deleteSupplier).toHaveBeenCalledWith(9, 4);
    expect(result).toEqual({
      success: true,
      data: null,
      error: null,
      message: null
    });
  });
});
