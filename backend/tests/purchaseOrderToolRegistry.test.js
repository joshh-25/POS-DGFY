import { jest } from '@jest/globals';
import { buildPurchaseOrderToolRegistry } from '../src/modules/ai/usecases/toolHandlers/purchaseOrderToolRegistry.js';

describe('purchaseOrderToolRegistry', () => {
  it('get_purchase_orders maps service rows into AI payload', async () => {
    const registry = buildPurchaseOrderToolRegistry({
      purchaseOrderService: {
        getPurchaseOrders: jest.fn().mockResolvedValue([
          {
            po_id: 1,
            po_number: 'PO-001',
            status: 'pending',
            order_date: '2026-03-04',
            expected_delivery_date: '2026-03-08',
            total_amount: 1200,
            Supplier: { name: 'Acme Supplies' },
            POLineItems: [{}, {}]
          }
        ])
      }
    });

    const result = await registry.get_purchase_orders({ args: { status: 'pending' } });

    expect(result).toEqual({
      count: 1,
      purchase_orders: [
        {
          po_id: 1,
          po_number: 'PO-001',
          supplier_name: 'Acme Supplies',
          status: 'pending',
          order_date: '2026-03-04',
          expected_delivery_date: '2026-03-08',
          total_amount: 1200,
          items_count: 2
        }
      ]
    });
  });

  it('create_purchase_order maps line items and formats output details', async () => {
    const createPurchaseOrder = jest.fn().mockResolvedValue({
      po_id: 9,
      po_number: 'PO-009',
      total_amount: 350.5,
      expected_delivery_date: '2026-03-10T00:00:00.000Z'
    });

    const registry = buildPurchaseOrderToolRegistry({
      purchaseOrderService: { createPurchaseOrder }
    });

    const result = await registry.create_purchase_order({
      args: {
        supplier_id: 5,
        supplier_name: 'North Star',
        expected_delivery_date: '2026-03-10',
        notes: 'priority',
        items: [
          { item_id: 11, quantity: 3, unit_price: 50 },
          { item_id: 12, quantity: 2, unit_price: 100.25 }
        ]
      },
      user: { user_id: 99 }
    });

    expect(createPurchaseOrder).toHaveBeenCalledWith(
      {
        supplier_id: 5,
        expected_delivery_date: '2026-03-10',
        notes: 'priority',
        line_items: [
          { item_id: 11, quantity_ordered: 3, unit_price: 50 },
          { item_id: 12, quantity_ordered: 2, unit_price: 100.25 }
        ]
      },
      99
    );

    expect(result.success).toBe(true);
    expect(result.po_number).toBe('PO-009');
    expect(result.details.Supplier).toBe('North Star');
  });

  it('receive_purchase_order forwards receipt and returns completion summary', async () => {
    const receivePurchaseOrder = jest.fn().mockResolvedValue({
      itemsReceived: 2,
      batchesCreated: 3
    });

    const registry = buildPurchaseOrderToolRegistry({
      purchaseOrderService: { receivePurchaseOrder }
    });

    const result = await registry.receive_purchase_order({
      args: {
        po_id: 88,
        received_items: [{ po_line_item_id: 1, quantity_received: 10 }]
      },
      user: { user_id: 7 }
    });

    expect(receivePurchaseOrder).toHaveBeenCalledWith(
      88,
      [{ po_line_item_id: 1, quantity_received: 10 }],
      7
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        po_id: 88,
        items_received: 2,
        batches_created: 3
      })
    );
  });
});
