import { jest } from '@jest/globals';
import { buildGetPurchaseOrderByIdUseCase } from '../src/modules/purchaseOrders/usecases/getPurchaseOrderByIdUseCase.js';
import { buildCreatePurchaseOrderUseCase } from '../src/modules/purchaseOrders/usecases/createPurchaseOrderUseCase.js';
import { buildFinalizePurchaseOrderUseCase } from '../src/modules/purchaseOrders/usecases/finalizePurchaseOrderUseCase.js';
import { buildReceivePurchaseOrderUseCase } from '../src/modules/purchaseOrders/usecases/receivePurchaseOrderUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import dbStore from '../src/utils/dbStore.js';

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

  it('getPurchaseOrderById validates valuationLocationId when provided', async () => {
    const useCase = buildGetPurchaseOrderByIdUseCase({
      purchaseOrderRepository: { getPurchaseOrderById: jest.fn() }
    });

    const result = await useCase({ poId: 22, valuationLocationId: 'bad-location' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('getPurchaseOrderById forwards normalized valuationLocationId to repository', async () => {
    const getPurchaseOrderById = jest.fn().mockResolvedValue({ po_id: 22 });
    const useCase = buildGetPurchaseOrderByIdUseCase({
      purchaseOrderRepository: { getPurchaseOrderById }
    });

    const result = await useCase({ poId: '22', valuationLocationId: '9' });
    expect(result.success).toBe(true);
    expect(getPurchaseOrderById).toHaveBeenCalledWith(22, { valuationLocationId: 9 });
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

  it('receivePurchaseOrder records purchase receipt through Inventory command boundary', async () => {
    const transaction = {
      finished: false,
      commit: jest.fn(async () => { transaction.finished = true; }),
      rollback: jest.fn(async () => { transaction.finished = true; })
    };
    const fakeSequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };
    const po = {
      po_id: 22,
      po_number: 'PO-2026-000022',
      notes: 'expected delivery',
      delivery_rating: null,
      lineItems: [{
        line_item_id: 5,
        quantity_received: 1,
        quantity_ordered: 4,
        unit_price: 12.5,
        expiry_date: null,
        item: { item_id: 99, name: 'Motor' }
      }]
    };
    const purchaseOrderRepository = {
      getPurchaseOrderById: jest.fn()
        .mockResolvedValueOnce(po)
        .mockResolvedValueOnce({ ...po, status: 'partial' }),
      updatePOLineItem: jest.fn().mockResolvedValue(undefined),
      getPOLineItemsByPoId: jest.fn().mockResolvedValue([{
        quantity_received: 3,
        quantity_ordered: 4
      }]),
      updatePurchaseOrder: jest.fn().mockResolvedValue(undefined)
    };
    const inventoryCommandService = {
      receivePurchasedStock: jest.fn().mockResolvedValue({ movement_id: 77 })
    };
    const useCase = buildReceivePurchaseOrderUseCase({
      purchaseOrderRepository,
      inventoryCommandService
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      poId: '22',
      userId: '8',
      receiptData: {
        location_id: '3',
        notes: 'dock checked',
        line_items: [{ line_item_id: 5, quantity_received: 2, expiry_date: '2026-12-31' }]
      }
    }));

    expect(result.success).toBe(true);
    expect(inventoryCommandService.receivePurchasedStock).toHaveBeenCalledWith(
      expect.objectContaining({
        item_id: 99,
        quantity: 2,
        movement_type: 'purchase_receipt',
        location_id: 3,
        reference_type: 'PO',
        reference_id: 'PO-2026-000022',
        cost_per_unit: 12.5
      }),
      8,
      transaction
    );
    expect(purchaseOrderRepository.updatePOLineItem).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ quantity_received: 3 }),
      { transaction }
    );
  });

});
