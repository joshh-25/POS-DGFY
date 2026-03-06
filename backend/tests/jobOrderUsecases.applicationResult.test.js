import { jest } from '@jest/globals';
import {
  buildGetJobOrderByIdUseCase,
  buildCreateJobOrderUseCase,
  buildCompleteJobOrderUseCase,
  buildArchiveJobOrderUseCase
} from '../src/modules/jobOrders/usecases/jobOrderUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('jobOrder use-cases application result contract', () => {
  it('getJobOrderById validates jobOrderId', async () => {
    const useCase = buildGetJobOrderByIdUseCase({
      jobOrderService: { getJobOrderById: jest.fn() }
    });

    const result = await useCase({ jobOrderId: 'bad' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('createJobOrder wraps service success payload', async () => {
    const createJobOrder = jest.fn().mockResolvedValue({
      jo_id: 40,
      jo_number: 'JO-2026-000040',
      status: 'in_progress'
    });
    const useCase = buildCreateJobOrderUseCase({
      jobOrderService: { createJobOrder }
    });

    const jobOrderData = { product_id: 3, quantity_to_produce: 12 };
    const result = await useCase({ jobOrderData, userId: '6' });

    expect(createJobOrder).toHaveBeenCalledWith(jobOrderData, 6);
    expect(result).toEqual({
      success: true,
      data: { jo_id: 40, jo_number: 'JO-2026-000040', status: 'in_progress' },
      error: null,
      message: null
    });
  });

  it('completeJobOrder validates completionData shape', async () => {
    const useCase = buildCompleteJobOrderUseCase({
      jobOrderService: { completeJobOrder: jest.fn() }
    });

    const result = await useCase({
      jobOrderId: 9,
      userId: 4,
      completionData: 'bad-shape'
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('archiveJobOrder maps not-found errors from service', async () => {
    const notFoundError = new Error('Job Order not found');
    notFoundError.statusCode = 404;

    const useCase = buildArchiveJobOrderUseCase({
      jobOrderService: { archiveJobOrder: jest.fn().mockRejectedValue(notFoundError) }
    });

    const result = await useCase({ jobOrderId: '99', userId: '3' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(result.error.statusCode).toBe(404);
  });
});

