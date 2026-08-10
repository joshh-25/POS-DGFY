import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { createStockMovement } from '../src/services/stockMovementService.js';

describe('stockMovementService service-mode guard', () => {
  let getSpy;

  beforeEach(() => {
    getSpy = jest.spyOn(dbStore, 'get');
  });

  afterEach(() => {
    getSpy.mockRestore();
  });

  it('rejects manual stock movements for pure service rows', async () => {
    const serviceItem = {
      item_id: 501,
      name: 'Barber Cut',
      category: 'product',
      mode_item_preset: 'service',
      current_stock: 0
    };
    const Item = {
      findOne: jest.fn().mockResolvedValue(serviceItem)
    };

    getSpy.mockImplementation((name) => {
      if (name === 'Item') return Item;
      return {};
    });

    await expect(createStockMovement({
      item_id: 501,
      movement_type: 'adjustment',
      quantity: 1
    }, 7, { LOCK: { UPDATE: 'UPDATE' } })).rejects.toMatchObject({
      statusCode: 422,
      message: 'Pure service items are stock-exempt and cannot have stock movements.'
    });
  });
});
