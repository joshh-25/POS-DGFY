import { jest } from '@jest/globals';
import { buildStockMovementToolRegistry } from '../src/modules/ai/usecases/toolHandlers/stockMovementToolRegistry.js';

describe('stockMovementToolRegistry', () => {
  it('get_stock_movements maps both array and wrapped payloads', async () => {
    const getStockMovements = jest
      .fn()
      .mockResolvedValueOnce([
        {
          movement_id: 1,
          movement_type: 'purchase_receipt',
          quantity: 10,
          reference_id: 'PO-1',
          reference_type: 'purchase_order',
          timestamp: '2026-03-04T00:00:00.000Z',
          item: { name: 'Flour' },
          userResponsible: { username: 'admin' }
        }
      ])
      .mockResolvedValueOnce({
        movements: [
          {
            movement_id: 2,
            movement_type: 'adjustment',
            quantity: -2,
            reference_id: 'ADJ-1',
            reference_type: 'manual',
            timestamp: '2026-03-05T00:00:00.000Z',
            item: { name: 'Sugar' },
            userResponsible: { username: 'manager' }
          }
        ]
      });

    const registry = buildStockMovementToolRegistry({
      stockMovementService: { getStockMovements }
    });

    const first = await registry.get_stock_movements({ args: { limit: 10 } });
    const second = await registry.get_stock_movements({ args: { limit: 10 } });

    expect(first).toEqual({
      count: 1,
      movements: [
        {
          movement_id: 1,
          item_name: 'Flour',
          movement_type: 'purchase_receipt',
          quantity: 10,
          reference: 'PO-1',
          reference_type: 'purchase_order',
          timestamp: '2026-03-04T00:00:00.000Z',
          created_by: 'admin'
        }
      ]
    });

    expect(second).toEqual({
      count: 1,
      movements: [
        {
          movement_id: 2,
          item_name: 'Sugar',
          movement_type: 'adjustment',
          quantity: -2,
          reference: 'ADJ-1',
          reference_type: 'manual',
          timestamp: '2026-03-05T00:00:00.000Z',
          created_by: 'manager'
        }
      ]
    });
  });

  it('create_stock_adjustment forwards movement args and acting user', async () => {
    const createStockMovement = jest.fn().mockResolvedValue({
      movement_id: 55,
      newStockLevel: 88
    });

    const registry = buildStockMovementToolRegistry({
      stockMovementService: { createStockMovement }
    });

    const result = await registry.create_stock_adjustment({
      args: {
        item_id: 9,
        quantity: -5,
        movement_type: 'adjustment',
        reason: 'Damaged',
        batch_id: 20
      },
      user: { user_id: 7 }
    });

    expect(createStockMovement).toHaveBeenCalledWith(
      {
        item_id: 9,
        quantity: -5,
        movement_type: 'adjustment',
        notes: 'Damaged',
        batch_id: 20
      },
      7
    );

    expect(result).toEqual({
      success: true,
      message: 'Stock adjustment recorded successfully',
      movement_id: 55,
      new_stock_level: 88
    });
  });
});
