import { jest } from '@jest/globals';
import {
  buildGetDispatchOrderByIdUseCase,
  buildCreateDispatchOrderUseCase,
  buildDispatchLinesUseCase,
  buildCancelDispatchOrderUseCase
} from '../src/modules/dispatchOrders/usecases/dispatchOrderUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('dispatchOrder use-cases application result contract', () => {
  it('getDispatchOrderById validates dispatchOrderId', async () => {
    const useCase = buildGetDispatchOrderByIdUseCase({
      dispatchOrderService: { getDispatchOrderById: jest.fn() }
    });

    const result = await useCase({ dispatchOrderId: 'bad' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('createDispatchOrder wraps service success payload', async () => {
    const createDispatchOrder = jest.fn().mockResolvedValue({
      do_id: 12,
      do_number: 'DO-2026-000012',
      status: 'draft'
    });
    const useCase = buildCreateDispatchOrderUseCase({
      dispatchOrderService: { createDispatchOrder }
    });

    const dispatchOrderData = {
      recipient_name: 'Warehouse B',
      lines: [{ item_id: 9, qty_ordered: 12 }]
    };
    const result = await useCase({ dispatchOrderData, userId: '4' });

    expect(createDispatchOrder).toHaveBeenCalledWith(dispatchOrderData, 4);
    expect(result).toEqual({
      success: true,
      data: { do_id: 12, do_number: 'DO-2026-000012', status: 'draft' },
      error: null,
      message: null
    });
  });

  it('dispatchLines validates non-empty lines array', async () => {
    const useCase = buildDispatchLinesUseCase({
      dispatchOrderService: { dispatchLines: jest.fn() }
    });

    const result = await useCase({ dispatchOrderId: 3, lines: [], userId: 7 });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('cancelDispatchOrder maps not found service errors', async () => {
    const notFoundError = new Error('Dispatch Order not found');
    notFoundError.statusCode = 404;

    const useCase = buildCancelDispatchOrderUseCase({
      dispatchOrderService: { cancelDispatchOrder: jest.fn().mockRejectedValue(notFoundError) }
    });

    const result = await useCase({ dispatchOrderId: '33', userId: '8', reason: 'duplicate' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(result.error.statusCode).toBe(404);
  });
});

