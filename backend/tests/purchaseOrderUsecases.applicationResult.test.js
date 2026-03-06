import { jest } from '@jest/globals';
import { buildGetPurchaseOrderByIdUseCase } from '../src/modules/purchaseOrders/usecases/getPurchaseOrderByIdUseCase.js';
import { buildCreatePurchaseOrderUseCase } from '../src/modules/purchaseOrders/usecases/createPurchaseOrderUseCase.js';
import { buildFinalizePurchaseOrderUseCase } from '../src/modules/purchaseOrders/usecases/finalizePurchaseOrderUseCase.js';
import { buildReceivePurchaseOrderUseCase } from '../src/modules/purchaseOrders/usecases/receivePurchaseOrderUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('purchaseOrder use-cases application result contract', () => {
  it('getPurchaseOrderById validates poId', async () => {
    const useCase = buildGetPurchaseOrderByIdUseCase({
      purchaseOrderRepository: { getPurchaseOrderById: jest.fn() }
    });

    const result = await useCase({ poId: 'bad' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('createPurchaseOrder wraps repository success payload', async () => {
    const createPurchaseOrder = jest.fn().mockResolvedValue({
      po_id: 45,
      po_number: 'PO-2026-000045',
      status: 'pending'
    });
    const useCase = buildCreatePurchaseOrderUseCase({
      purchaseOrderRepository: { createPurchaseOrder }
    });

    const poData = { supplier_id: 9, line_items: [{ item_id: 2, quantity_ordered: 4, unit_price: 3.25 }] };
    const result = await useCase({ poData, userId: '8' });

    expect(createPurchaseOrder).toHaveBeenCalledWith(poData, 8);
    expect(result).toEqual({
      success: true,
      data: { po_id: 45, po_number: 'PO-2026-000045', status: 'pending' },
      error: null,
      message: null
    });
  });

  it('finalizePurchaseOrder maps not found errors from repository', async () => {
    const notFoundError = new Error('Purchase order not found');
    notFoundError.statusCode = 404;

    const useCase = buildFinalizePurchaseOrderUseCase({
      purchaseOrderRepository: { finalizePurchaseOrder: jest.fn().mockRejectedValue(notFoundError) }
    });

    const result = await useCase({ poId: '101', userId: 3 });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(result.error.statusCode).toBe(404);
  });

  it('receivePurchaseOrder validates receiptData object', async () => {
    const useCase = buildReceivePurchaseOrderUseCase({
      purchaseOrderRepository: { receivePurchaseOrder: jest.fn() }
    });

    const result = await useCase({ poId: 22, receiptData: null, userId: 5 });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });
});

