import { jest } from '@jest/globals';
import { buildItemToolRegistry } from '../src/modules/ai/usecases/toolHandlers/itemToolRegistry.js';

describe('itemToolRegistry', () => {
  it('get_items maps list payload and computes stock status', async () => {
    const registry = buildItemToolRegistry({
      itemService: {
        getItems: jest.fn().mockResolvedValue({
          items: [
            {
              item_id: 1,
              sku_code: 'SKU-1',
              name: 'Flour',
              category: 'raw_material',
              product_type: 'ingredient',
              description: 'Fine flour',
              current_stock: 5,
              max_capacity: 100,
              min_threshold: 10,
              purchase_allowance: 20,
              unit_of_measure: 'kg',
              batch_size: null,
              yield_percentage: null,
              processing_loss: null,
              cost_per_unit: 2.5,
              fifo_enabled: true,
              status: 'active'
            }
          ],
          total: 1,
          page: 1
        })
      }
    });

    const result = await registry.get_items({ args: { search: 'Flour' } });

    expect(result.count).toBe(1);
    expect(result.total).toBe(1);
    expect(result.items[0].stock_status).toBe('low');
    expect(result.items[0].sku_code).toBe('SKU-1');
  });

  it('get_item_details supports sku fallback and includes related collections', async () => {
    const itemService = {
      getItemById: jest.fn(),
      getItems: jest.fn().mockResolvedValue({
        items: [
          {
            item_id: 7,
            sku_code: 'SKU-7',
            name: 'Milk',
            category: 'dairy',
            current_stock: 20,
            max_capacity: 100,
            min_threshold: 10,
            unit_of_measure: 'L',
            suppliers: [{ supplier_id: 9, name: 'DairyCo', moq: 5, price_per_unit: 1.8 }]
          }
        ]
      }),
      getItemBatches: jest.fn().mockResolvedValue([
        {
          batch_id: 3,
          quantity: 10,
          cost_per_unit: 1.8,
          received_date: '2026-03-01',
          expiry_date: '2026-03-10',
          quantity_consumed: 2
        }
      ]),
      getItemStockHistory: jest.fn().mockResolvedValue([
        {
          movement_type: 'purchase_receipt',
          quantity: 10,
          timestamp: '2026-03-01T00:00:00.000Z',
          reference_id: 12
        }
      ])
    };

    const registry = buildItemToolRegistry({ itemService });

    const result = await registry.get_item_details({ args: { sku_code: 'SKU-7' } });

    expect(itemService.getItems).toHaveBeenCalledWith({ search: 'SKU-7', limit: 1 });
    expect(result.suppliers[0].name).toBe('DairyCo');
    expect(result.batches[0].batch_id).toBe(3);
    expect(result.recent_movements[0].type).toBe('purchase_receipt');
  });

  it('update_item formats detail keys and preserves related entity', async () => {
    const updateItem = jest.fn().mockResolvedValue({
      item_id: 10,
      name: 'Sugar',
      sku_code: 'SKU-SUGAR'
    });

    const registry = buildItemToolRegistry({
      itemService: { updateItem }
    });

    const result = await registry.update_item({
      args: { item_id: 10, min_threshold: 12, updated_at: 'ignore-me' },
      user: { user_id: 5 }
    });

    expect(updateItem).toHaveBeenCalledWith(10, { min_threshold: 12, updated_at: 'ignore-me' }, 5);
    expect(result.details).toEqual({ 'Min Threshold': '12' });
    expect(result.related_entity).toEqual({ type: 'item', id: 10, label: 'SKU-SUGAR' });
  });

  it('delete_item calls service with reason and returns soft-delete payload', async () => {
    const deleteItem = jest.fn().mockResolvedValue(undefined);
    const registry = buildItemToolRegistry({
      itemService: { deleteItem }
    });

    const result = await registry.delete_item({
      args: { item_id: 11, reason: 'obsolete' },
      user: { user_id: 1 }
    });

    expect(deleteItem).toHaveBeenCalledWith(11, 1, 'obsolete');
    expect(result.success).toBe(true);
    expect(result.details.Reason).toBe('obsolete');
  });
});
