import { jest } from '@jest/globals';
import { buildStoreCartQuoteUseCase } from '../src/modules/store/usecases/storeUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const buildRepository = (items) => ({
  findLocationById: jest.fn().mockResolvedValue({
    location_id: 4,
    name: 'Main',
    is_active: true,
    is_open: true,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: true,
    allow_out_of_stock_sales: true
  }),
  getSettingsByKeys: jest.fn().mockResolvedValue([]),
  findSellableItemsByIds: jest.fn().mockResolvedValue(items)
});

const burgerItem = {
  item_id: 20,
  name: 'Burger',
  category: 'finished_good',
  unit_of_measure: 'each',
  current_stock: 10,
  default_sale_price: 100,
  cost_per_unit: 40,
  vat_type: 'vatable',
  fnbModifierGroups: [{
    modifier_group_id: 5,
    name: 'Cheese',
    display_name: 'Cheese',
    min_select: 0,
    max_select: 1,
    is_active: true,
    options: [{
      modifier_option_id: 8,
      name: 'Cheddar',
      price_delta: 15,
      is_active: true,
      allergen_notes: ['milk']
    }]
  }]
};

describe('storefront F&B modifier checkout contract', () => {
  it('computes quote totals from database-backed F&B modifier deltas and snapshots selected options', async () => {
    const repository = buildRepository([burgerItem]);
    const useCase = buildStoreCartQuoteUseCase({ storeRepository: repository });

    const result = await useCase({
      payload: {
        location_id: 4,
        order_method: 'pickup',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{
          item_id: 20,
          quantity: 2,
          line_modifiers: [{
            modifier_group_id: 5,
            modifier_option_id: 8
          }]
        }]
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.subtotal_amount).toBe(230);
    expect(result.data.service_fee_amount).toBe(2.3);
    expect(result.data.total_amount).toBe(232.3);
    expect(result.data.lines[0]).toEqual(expect.objectContaining({
      sale_price: 115,
      line_subtotal: 230,
      fnb_modifiers_snapshot: [expect.objectContaining({
        modifier_group_id: 5,
        modifier_option_id: 8,
        option_name: 'Cheddar',
        price_delta: 15
      })]
    }));
  });

  it('rejects selected modifier options that are not published for the menu item', async () => {
    const repository = buildRepository([burgerItem]);
    const useCase = buildStoreCartQuoteUseCase({ storeRepository: repository });

    const result = await useCase({
      payload: {
        location_id: 4,
        order_method: 'pickup',
        customer_name: 'Ana',
        customer_phone: '09170000000',
        lines: [{
          item_id: 20,
          quantity: 1,
          line_modifiers: [{
            modifier_group_id: 5,
            modifier_option_id: 999
          }]
        }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
  });
});
