import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { fnbRepository } from '../src/modules/fnb/repositories/fnbRepository.js';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';
import { storeRepository } from '../src/modules/store/repositories/storeRepository.js';
import { buildFnbRecipeConsumptionPlan } from '../src/modules/shared/utils/fnbRecipeConsumption.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const asRow = (payload) => ({
  ...payload,
  toJSON: () => payload
});

describe('F&B operational readiness QA contracts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports recipe component shortfalls with menu, ingredient, location, and required quantities', () => {
    expect(() => buildFnbRecipeConsumptionPlan({
      locationId: 4,
      lines: [{ item_id: 10, quantity: 2 }],
      itemMap: new Map([
        [10, { item_id: 10, name: 'QA Burger', unit_of_measure: 'serving', current_stock: 0 }],
        [21, { item_id: 21, name: 'QA Patty', unit_of_measure: 'pcs', current_stock: 1 }]
      ]),
      compositions: [{
        product_id: 10,
        ingredient_id: 21,
        quantity_required: 1,
        unit_of_measure: 'pcs',
        ingredient: { item_id: 21, name: 'QA Patty', unit_of_measure: 'pcs', current_stock: 1 }
      }]
    })).toThrow(expect.objectContaining({
      code: DomainErrorCode.VALIDATION_FAILED,
      details: expect.objectContaining({
        reason_code: 'FNB_RECIPE_INGREDIENT_SHORTFALL',
        product_item_id: 10,
        product_name: 'QA Burger',
        ingredient_item_id: 21,
        ingredient_name: 'QA Patty',
        location_id: 4,
        requested: 2,
        available: 1,
        unit_of_measure: 'pcs'
      })
    }));
  });

  it('updates only non-voided F&B check lines when kitchen ticket progress changes', async () => {
    const update = jest.fn().mockResolvedValue([2]);
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'FnbCheckLine') return { update };
      throw new Error(`Unexpected model lookup: ${name}`);
    });

    const count = await fnbRepository.updateCheckLinesStatus({
      checkId: 12,
      lineIds: [101, 102, 102],
      status: 'ready'
    }, { transaction: 'txn' });

    expect(count).toBe(2);
    expect(update).toHaveBeenCalledWith(
      { status: 'ready' },
      expect.objectContaining({
        where: expect.objectContaining({
          check_id: 12,
          check_line_id: expect.any(Object),
          status: expect.any(Object)
        }),
        transaction: 'txn'
      })
    );
  });

  it('reuses an existing Storefront F&B kitchen ticket for the accepted POS transaction', async () => {
    const existingCheck = asRow({ check_id: 55, pos_transaction_id: 501, status: 'sent_to_kitchen' });
    const existingTicket = asRow({ kitchen_ticket_id: 77, check_id: 55, status: 'queued' });
    const FnbCheck = {
      findOne: jest.fn().mockResolvedValue(existingCheck),
      create: jest.fn()
    };
    const FnbCheckLine = {
      findAll: jest.fn(),
      bulkCreate: jest.fn()
    };
    const FnbKitchenTicket = {
      findOne: jest.fn().mockResolvedValue(existingTicket),
      create: jest.fn()
    };
    const PosTransaction = { update: jest.fn() };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => ({
      FnbCheck,
      FnbCheckLine,
      FnbKitchenTicket,
      PosTransaction
    }[name]));

    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const result = await storeRepository.createFnbKitchenOrderForOnlineTransaction({
      pos_transaction_id: 501,
      lines: [{ item_id: 10, quantity: 1 }]
    }, { transaction, lock: true });

    expect(result).toMatchObject({
      idempotent_existing_ticket: true,
      check: { check_id: 55 },
      kitchen_ticket: { kitchen_ticket_id: 77 }
    });
    expect(FnbCheck.create).not.toHaveBeenCalled();
    expect(FnbCheckLine.bulkCreate).not.toHaveBeenCalled();
    expect(FnbKitchenTicket.create).not.toHaveBeenCalled();
    expect(PosTransaction.update).not.toHaveBeenCalled();
  });

  it('fires an existing POS check from persisted check lines instead of duplicating checkout payload lines', async () => {
    const existingCheck = {
      check_id: 88,
      status: 'open',
      update: jest.fn().mockResolvedValue(),
      toJSON: () => ({ check_id: 88, status: 'open' })
    };
    const FnbCheck = {
      findByPk: jest.fn().mockResolvedValue(existingCheck),
      create: jest.fn()
    };
    const FnbCheckLine = {
      findAll: jest.fn().mockResolvedValue([
        asRow({
          check_line_id: 301,
          check_id: 88,
          item_id: 40,
          quantity: '2.0000',
          course: 'main',
          kitchen_station_id: 3,
          status: 'sent'
        })
      ]),
      update: jest.fn().mockResolvedValue([1]),
      bulkCreate: jest.fn()
    };
    const FnbKitchenTicket = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(asRow({ kitchen_ticket_id: 90, check_id: 88, status: 'queued' }))
    };
    const PosTransaction = { update: jest.fn() };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => ({
      FnbCheck,
      FnbCheckLine,
      FnbKitchenTicket,
      PosTransaction
    }[name]));

    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const result = await posRepository.createFnbKitchenOrderForTransaction({
      pos_transaction_id: 700,
      check_id: 88,
      order_notes: 'Less ice',
      lines: [{ item_id: 999, quantity: 1 }],
      recipe_movements: [{ component_item_id: 41 }]
    }, { transaction, lock: true });

    expect(result.kitchen_ticket).toMatchObject({ kitchen_ticket_id: 90 });
    expect(FnbCheckLine.bulkCreate).not.toHaveBeenCalled();
    expect(existingCheck.update).toHaveBeenCalledWith({
      status: 'sent_to_kitchen',
      pos_transaction_id: 700,
      notes: 'Less ice'
    }, { transaction });
    expect(FnbKitchenTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      check_id: 88,
      kitchen_station_id: 3,
      lines_snapshot: expect.objectContaining({
        source: 'pos_checkout',
        pos_transaction_id: 700,
        lines: [expect.objectContaining({
          check_line_id: 301,
          item_id: 40,
          quantity: 2
        })],
        recipe_movements: [{ component_item_id: 41 }]
      })
    }), { transaction });
  });
});
