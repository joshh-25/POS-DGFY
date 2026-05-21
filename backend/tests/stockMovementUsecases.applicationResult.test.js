import { jest } from '@jest/globals';
import {
  buildGetMovementByIdUseCase,
  buildCreateStockMovementUseCase,
  buildVoidMovementUseCase,
  buildCreateBulkMovementsUseCase
} from '../src/modules/stockMovements/usecases/stockMovementUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('stockMovement use-cases application result contract', () => {
  it('getMovementById validates movementId', async () => {
    const useCase = buildGetMovementByIdUseCase({
      stockMovementService: { getMovementById: jest.fn() }
    });

    const result = await useCase({ movementId: 'bad' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('createStockMovement wraps service success payload', async () => {
    const createStockMovement = jest.fn().mockResolvedValue({
      movement_id: 101,
      item_id: 7,
      movement_type: 'adjustment'
    });
    const useCase = buildCreateStockMovementUseCase({
      stockMovementService: { createStockMovement }
    });

    const payload = { item_id: 7, quantity: 5, movement_type: 'adjustment' };
    const result = await useCase({ movementData: payload, userId: '4' });

    expect(createStockMovement).toHaveBeenCalledWith(payload, 4);
    expect(result).toEqual({
      success: true,
      data: { movement_id: 101, item_id: 7, movement_type: 'adjustment' },
      error: null,
      message: null
    });
  });

  it('voidMovement maps conflict errors from service', async () => {
    const conflictError = new Error('Movement is already voided');
    conflictError.statusCode = 400;

    const useCase = buildVoidMovementUseCase({
      stockMovementService: { voidMovement: jest.fn().mockRejectedValue(conflictError) }
    });

    const result = await useCase({
      movementId: '13',
      userId: 5,
      reason: 'Duplicate void'
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('createBulkMovements validates non-empty array input', async () => {
    const useCase = buildCreateBulkMovementsUseCase({
      stockMovementService: { createBulkMovements: jest.fn() }
    });

    const result = await useCase({ movements: [], userId: 2 });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });
});
