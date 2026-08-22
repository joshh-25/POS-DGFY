import { buildOnlineInventoryEffects } from '../src/modules/shared/utils/onlineInventoryEffects.js';

describe('online inventory effect construction', () => {
  it('keeps quote/preview mode lenient for incomplete effects', () => {
    expect(buildOnlineInventoryEffects({
      lines: [{ item_id: 10, quantity: 1 }],
      recipePlan: { movementsByLineIndex: [[{ ingredient_item_id: null, quantity: 1 }]] },
      locationId: 4
    })).toEqual([]);
  });

  it('fails closed for checkout and POS fulfillment mode', () => {
    expect(() => buildOnlineInventoryEffects({
      lines: [{ item_id: 10, quantity: 1 }],
      recipePlan: { movementsByLineIndex: [[{ ingredient_item_id: null, quantity: 1 }]] },
      locationId: 4,
      strict: true
    })).toThrow(expect.objectContaining({
      code: 'VALIDATION_FAILED',
      details: expect.objectContaining({ reason_code: 'ONLINE_INVENTORY_RECIPE_EFFECT_INVALID' })
    }));
  });

  it('builds a valid finished-item effect with stable references', () => {
    expect(buildOnlineInventoryEffects({
      lines: [{ item_id: 10, item_name_snapshot: 'Burger', quantity: 2 }],
      recipePlan: { movementsByLineIndex: [[]] },
      locationId: 4,
      orderId: 99,
      strict: true
    })).toEqual([expect.objectContaining({
      item_id: 10,
      quantity: 2,
      reference_id: 'ONLINE:99:10-1'
    })]);
  });
});
