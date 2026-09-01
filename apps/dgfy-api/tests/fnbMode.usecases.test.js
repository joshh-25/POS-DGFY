import { jest } from '@jest/globals';
import {
  buildAddCheckLineUseCase,
  buildCreateCheckUseCase,
  buildCreateKitchenTicketUseCase,
  buildCreateModifierGroupUseCase,
  buildCreateReservationUseCase,
  buildListReservationsUseCase,
  buildMergeChecksUseCase,
  buildReplaceItemModifierGroupsUseCase,
  buildSplitCheckUseCase,
  buildTransferCheckUseCase,
  buildGetServiceChargeSettingsUseCase,
  buildUpsertItemKitchenRouteUseCase,
  buildUpdateCheckStatusUseCase,
  buildUpdateKitchenTicketStatusUseCase,
  buildUpdateModifierGroupUseCase,
  buildUpdateReservationStatusUseCase,
  buildUpdateServiceChargeSettingsUseCase
} from '../src/modules/fnb/usecases/fnbUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const buildTransaction = () => ({
  LOCK: { UPDATE: 'UPDATE' },
  commit: jest.fn().mockResolvedValue(),
  rollback: jest.fn().mockResolvedValue()
});

const buildTransactionalRepository = (overrides = {}) => {
  const transaction = buildTransaction();
  return {
    transaction,
    beginTransaction: jest.fn().mockResolvedValue(transaction),
    ...overrides
  };
};

describe('Food & Beverage mode use cases', () => {
  it('rejects modifier groups whose minimum selection exceeds maximum selection', async () => {
    const repository = buildTransactionalRepository();
    const useCase = buildCreateModifierGroupUseCase({ fnbRepository: repository });

    const result = await useCase({
      payload: {
        name: 'Doneness',
        min_select: 2,
        max_select: 1,
        options: [{ name: 'Medium' }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(repository.beginTransaction).not.toHaveBeenCalled();
  });

  it('requires combo choice groups to select at least one option', async () => {
    const repository = buildTransactionalRepository();
    const result = await buildCreateModifierGroupUseCase({ fnbRepository: repository })({
      payload: { name: 'Choose a side', group_kind: 'combo_choice', required: false, min_select: 0, max_select: 1, options: [{ name: 'Rice' }] }
    });
    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Combo choice groups must be required and select at least one option');
    expect(repository.beginTransaction).not.toHaveBeenCalled();
  });

  it('normalizes optional modifier groups to zero minimum selections', async () => {
    const createRepository = buildTransactionalRepository({
      createModifierGroup: jest.fn().mockResolvedValue({ modifier_group_id: 7 })
    });
    const createResult = await buildCreateModifierGroupUseCase({ fnbRepository: createRepository })({
      payload: {
        name: 'Extras',
        required: false,
        min_select: 1,
        max_select: 1,
        options: [{ name: 'Cheese' }]
      }
    });

    expect(createResult.success).toBe(true);
    expect(createRepository.createModifierGroup).toHaveBeenCalledWith(expect.objectContaining({
      group: expect.objectContaining({ min_select: 0, required: false })
    }), { transaction: createRepository.transaction });

    const updateRepository = buildTransactionalRepository({
      updateModifierGroup: jest.fn().mockResolvedValue({ modifier_group_id: 7 })
    });
    const updateResult = await buildUpdateModifierGroupUseCase({ fnbRepository: updateRepository })({
      modifierGroupId: 7,
      payload: {
        name: 'Extras',
        required: false,
        min_select: 1,
        max_select: 1,
        options: [{ name: 'Cheese' }]
      }
    });

    expect(updateResult.success).toBe(true);
    expect(updateRepository.updateModifierGroup).toHaveBeenCalledWith(7, expect.objectContaining({
      group: expect.objectContaining({ min_select: 0, required: false })
    }), { transaction: updateRepository.transaction });
  });

  it('updates modifier pricing, channel state, inventory links, and location availability transactionally', async () => {
    const repository = buildTransactionalRepository({
      findActiveItemsByIds: jest.fn().mockResolvedValue([{ item_id: 90 }]),
      findActiveLocationsByIds: jest.fn().mockResolvedValue([{ location_id: 4 }]),
      updateModifierGroup: jest.fn().mockResolvedValue({ modifier_group_id: 5, name: 'Extras' })
    });
    const result = await buildUpdateModifierGroupUseCase({ fnbRepository: repository })({
      modifierGroupId: 5,
      payload: {
        name: 'Extras', min_select: 0, max_select: 2, visible_in_pos: true, visible_in_storefront: false,
        location_availability: [{ location_id: 4, is_available: true }],
        options: [{ modifier_option_id: 8, name: 'Extra rice', price_delta: 25, sku_item_id: 90, is_sold_out: false }]
      }
    });

    expect(result.success).toBe(true);
    expect(repository.updateModifierGroup).toHaveBeenCalledWith(5, expect.objectContaining({
      group: expect.objectContaining({ visible_in_storefront: false }),
      options: [expect.objectContaining({ modifier_option_id: 8, price_delta: 25, sku_item_id: 90 })],
      location_availability: [{ location_id: 4, is_available: true }]
    }), { transaction: repository.transaction });
  });

  it('opens a dine-in check and marks the selected table seated inside the transaction', async () => {
    const table = {
      dining_area_id: 3,
      update: jest.fn().mockResolvedValue()
    };
    const repository = buildTransactionalRepository({
      getTableById: jest.fn().mockResolvedValue(table),
      createCheck: jest.fn().mockResolvedValue({
        check_id: 9,
        table_id: 5,
        dining_area_id: 3,
        guest_count: 4,
        order_method: 'dine_in',
        status: 'open'
      })
    });
    const useCase = buildCreateCheckUseCase({ fnbRepository: repository });

    const result = await useCase({
      actorUserId: 44,
      payload: {
        table_id: 5,
        guest_count: 4,
        order_method: 'dine_in'
      }
    });

    expect(result.success).toBe(true);
    expect(repository.getTableById).toHaveBeenCalledWith(5, {
      transaction: repository.transaction,
      lock: true
    });
    expect(repository.createCheck).toHaveBeenCalledWith(expect.objectContaining({
      table_id: 5,
      dining_area_id: 3,
      server_id: 44,
      guest_count: 4,
      order_method: 'dine_in'
    }), { transaction: repository.transaction });
    expect(table.update).toHaveBeenCalledWith({ status: 'seated' }, {
      transaction: repository.transaction
    });
    expect(repository.transaction.commit).toHaveBeenCalled();
  });

  it('blocks unsupported check status transitions', async () => {
    const repository = buildTransactionalRepository({
      getCheckById: jest.fn().mockResolvedValue({
        status: 'paid',
        toJSON: () => ({ check_id: 10, status: 'paid', closed_at: new Date() })
      }),
      updateCheck: jest.fn()
    });
    const useCase = buildUpdateCheckStatusUseCase({ fnbRepository: repository });

    const result = await useCase({
      checkId: 10,
      payload: { status: 'open' }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    expect(repository.updateCheck).not.toHaveBeenCalled();
    expect(repository.transaction.rollback).toHaveBeenCalled();
  });

  it('queues kitchen tickets and moves the check to sent_to_kitchen', async () => {
    const repository = buildTransactionalRepository({
      getCheckById: jest.fn().mockResolvedValue({
        toJSON: () => ({
          check_id: 12,
          status: 'open',
          lines: [{ check_line_id: 1, item_id: 3 }]
        })
      }),
      createKitchenTicket: jest.fn().mockResolvedValue({
        kitchen_ticket_id: 6,
        status: 'queued',
        lines_snapshot: [{ check_line_id: 1, item_id: 3 }]
      }),
      updateCheck: jest.fn().mockResolvedValue({ check_id: 12, status: 'sent_to_kitchen' }),
      updateCheckLinesStatus: jest.fn().mockResolvedValue(1)
    });
    const useCase = buildCreateKitchenTicketUseCase({ fnbRepository: repository });

    const result = await useCase({
      checkId: 12,
      payload: { kitchen_station_id: 2 }
    });

    expect(result.success).toBe(true);
    expect(repository.createKitchenTicket).toHaveBeenCalledWith(expect.objectContaining({
      check_id: 12,
      kitchen_station_id: 2,
      status: 'queued',
      lines_snapshot: [{ check_line_id: 1, item_id: 3 }]
    }), { transaction: repository.transaction });
    expect(repository.updateCheck).toHaveBeenCalledWith(12, { status: 'sent_to_kitchen' }, {
      transaction: repository.transaction
    });
    expect(repository.updateCheckLinesStatus).toHaveBeenCalledWith({
      checkId: 12,
      lineIds: [1],
      status: 'sent'
    }, { transaction: repository.transaction });
  });

  it('uses configured kitchen routes when adding F&B check lines', async () => {
    const repository = {
      getCheckById: jest.fn().mockResolvedValue({
        toJSON: () => ({ check_id: 15, status: 'open' })
      }),
      getPrimaryKitchenRouteForItem: jest.fn().mockResolvedValue({
        item_id: 91,
        kitchen_station_id: 4,
        default_course: 'drink'
      }),
      createCheckLine: jest.fn().mockResolvedValue({
        check_line_id: 20,
        item_id: 91,
        kitchen_station_id: 4,
        course: 'drink'
      })
    };
    const useCase = buildAddCheckLineUseCase({ fnbRepository: repository });

    const result = await useCase({
      checkId: 15,
      payload: { item_id: 91, quantity: 2 }
    });

    expect(result.success).toBe(true);
    expect(repository.createCheckLine).toHaveBeenCalledWith(expect.objectContaining({
      item_id: 91,
      kitchen_station_id: 4,
      course: 'drink'
    }));
  });

  it('resolves F&B check-line modifier snapshots from configured options instead of trusting client pricing', async () => {
    const repository = {
      getCheckById: jest.fn().mockResolvedValue({ toJSON: () => ({ check_id: 16, status: 'open' }) }),
      listItemModifierGroups: jest.fn().mockResolvedValue([{
        item_id: 91,
        modifier_group_id: 5,
        modifierGroup: {
          modifier_group_id: 5,
          name: 'Cheese',
          required: false,
          min_select: 0,
          max_select: 1,
          options: [{
            modifier_option_id: 8,
            name: 'Cheddar',
            price_delta: 15,
            sku_item_id: 90,
            is_active: true,
            is_sold_out: false
          }]
        }
      }]),
      getPrimaryKitchenRouteForItem: jest.fn().mockResolvedValue({ default_course: 'main' }),
      createCheckLine: jest.fn().mockResolvedValue({ check_line_id: 21 })
    };

    const result = await buildAddCheckLineUseCase({ fnbRepository: repository })({
      checkId: 16,
      payload: {
        item_id: 91,
        modifiers: [{
          modifier_group_id: 5,
          modifier_option_id: 8,
          price_delta: 9999,
          sku_item_id: 999,
          quantity: 2
        }]
      }
    });

    expect(result.success).toBe(true);
    expect(repository.createCheckLine).toHaveBeenCalledWith(expect.objectContaining({
      modifiers_snapshot: [expect.objectContaining({
        modifier_group_id: 5,
        modifier_option_id: 8,
        price_delta: 15,
        extended_price_delta: 30,
        sku_item_id: 90,
        quantity: 2
      })]
    }));
  });

  it('rejects nested conditional modifier groups', async () => {
    const repository = buildTransactionalRepository({
      findModifierOptionById: jest.fn()
        .mockResolvedValueOnce({ modifier_group_id: 2, is_active: true })
        .mockResolvedValueOnce({ modifier_group_id: 3, is_active: true }),
      findModifierGroupById: jest.fn()
        .mockResolvedValueOnce({ modifier_group_id: 2, parent_modifier_option_id: 200 })
        .mockResolvedValueOnce({ modifier_group_id: 3, parent_modifier_option_id: null })
    });

    const result = await buildCreateModifierGroupUseCase({ fnbRepository: repository })({
      payload: {
        name: 'Sauce',
        parent_modifier_option_id: 100,
        options: [{ name: 'Garlic' }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain('one level deep');
    expect(repository.beginTransaction).not.toHaveBeenCalled();
  });

  it('rejects required modifier updates when active options cannot satisfy the minimum', async () => {
    const repository = buildTransactionalRepository({
      updateModifierGroup: jest.fn()
    });
    const result = await buildUpdateModifierGroupUseCase({ fnbRepository: repository })({
      modifierGroupId: 5,
      payload: {
        name: 'Sauce',
        required: true,
        min_select: 2,
        max_select: 2,
        options: [{ name: 'Garlic', is_active: true }, { name: 'Chili', is_active: false }]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain('enough active options');
    expect(repository.beginTransaction).not.toHaveBeenCalled();
  });

  it('transfers active checks to a new table and releases the source table', async () => {
    const targetTable = {
      dining_area_id: 8,
      update: jest.fn().mockResolvedValue()
    };
    const repository = buildTransactionalRepository({
      getCheckById: jest.fn().mockResolvedValue({
        toJSON: () => ({ check_id: 22, table_id: 3, dining_area_id: 7, status: 'open' })
      }),
      getTableById: jest.fn().mockResolvedValue(targetTable),
      updateCheck: jest.fn().mockResolvedValue({ check_id: 22, table_id: 5, status: 'open' }),
      updateTableStatus: jest.fn().mockResolvedValue({ table_id: 3, status: 'available' })
    });
    const useCase = buildTransferCheckUseCase({ fnbRepository: repository });

    const result = await useCase({
      checkId: 22,
      payload: { table_id: 5 }
    });

    expect(result.success).toBe(true);
    expect(repository.updateCheck).toHaveBeenCalledWith(22, expect.objectContaining({
      table_id: 5,
      dining_area_id: 8
    }), { transaction: repository.transaction });
    expect(targetTable.update).toHaveBeenCalledWith({ status: 'seated' }, { transaction: repository.transaction });
    expect(repository.updateTableStatus).toHaveBeenCalledWith(3, 'available', { transaction: repository.transaction });
  });

  it('splits selected check lines into a new active check', async () => {
    const repository = buildTransactionalRepository({
      getCheckById: jest.fn()
        .mockResolvedValueOnce({
          toJSON: () => ({ check_id: 30, table_id: 2, dining_area_id: 1, server_id: 9, status: 'open', order_method: 'dine_in' })
        })
        .mockResolvedValueOnce({ toJSON: () => ({ check_id: 30, lines: [{ check_line_id: 1 }] }) })
        .mockResolvedValueOnce({ toJSON: () => ({ check_id: 31, lines: [{ check_line_id: 2 }] }) }),
      createCheck: jest.fn().mockResolvedValue({ check_id: 31 }),
      moveCheckLines: jest.fn().mockResolvedValue(1),
      countCheckLines: jest.fn().mockResolvedValue(1)
    });
    const useCase = buildSplitCheckUseCase({ fnbRepository: repository });

    const result = await useCase({
      checkId: 30,
      payload: { line_ids: [2] }
    });

    expect(result.success).toBe(true);
    expect(repository.createCheck).toHaveBeenCalledWith(expect.objectContaining({
      table_id: 2,
      dining_area_id: 1,
      server_id: 9,
      order_method: 'dine_in'
    }), { transaction: repository.transaction });
    expect(repository.moveCheckLines).toHaveBeenCalledWith({
      lineIds: [2],
      fromCheckId: 30,
      toCheckId: 31
    }, { transaction: repository.transaction });
  });

  it('merges source check lines into a target check and closes the source as transferred', async () => {
    const repository = buildTransactionalRepository({
      getCheckById: jest.fn()
        .mockResolvedValueOnce({
          toJSON: () => ({ check_id: 40, status: 'open', lines: [{ check_line_id: 10 }] })
        })
        .mockResolvedValueOnce({
          toJSON: () => ({ check_id: 41, status: 'sent_to_kitchen', lines: [{ check_line_id: 11 }] })
        })
        .mockResolvedValueOnce({ toJSON: () => ({ check_id: 40, lines: [{ check_line_id: 10 }, { check_line_id: 11 }] }) })
        .mockResolvedValueOnce({ toJSON: () => ({ check_id: 41, status: 'transferred' }) }),
      moveCheckLines: jest.fn().mockResolvedValue(1),
      updateCheck: jest.fn().mockResolvedValue({ check_id: 41, status: 'transferred' })
    });
    const useCase = buildMergeChecksUseCase({ fnbRepository: repository });

    const result = await useCase({
      checkId: 40,
      payload: { source_check_id: 41 }
    });

    expect(result.success).toBe(true);
    expect(repository.moveCheckLines).toHaveBeenCalledWith({
      lineIds: [11],
      fromCheckId: 41,
      toCheckId: 40
    }, { transaction: repository.transaction });
    expect(repository.updateCheck).toHaveBeenCalledWith(41, expect.objectContaining({
      status: 'transferred'
    }), { transaction: repository.transaction });
  });

  it('saves item kitchen routes and item modifier assignments against F&B side tables', async () => {
    const repository = buildTransactionalRepository({
      listKitchenStations: jest.fn().mockResolvedValue([{ kitchen_station_id: 6, is_active: true }]),
      upsertItemKitchenRoute: jest.fn().mockResolvedValue({
        item_id: 80,
        kitchen_station_id: 6,
        default_course: 'main'
      }),
      replaceItemModifierGroups: jest.fn().mockResolvedValue([
        { item_id: 80, modifier_group_id: 5 }
      ])
    });

    const routeResult = await buildUpsertItemKitchenRouteUseCase({ fnbRepository: repository })({
      itemId: 80,
      payload: { kitchen_station_id: 6, default_course: 'main' }
    });
    const modifierResult = await buildReplaceItemModifierGroupsUseCase({ fnbRepository: repository })({
      itemId: 80,
      payload: { modifier_groups: [{ modifier_group_id: 5, sort_order: 0 }] }
    });

    expect(routeResult.success).toBe(true);
    expect(modifierResult.success).toBe(true);
    expect(repository.upsertItemKitchenRoute).toHaveBeenCalledWith(80, expect.objectContaining({
      kitchen_station_id: 6,
      default_course: 'main'
    }), { transaction: repository.transaction });
    expect(repository.replaceItemModifierGroups).toHaveBeenCalledWith(80, [{
      modifier_group_id: 5,
      is_required_override: null,
      is_excluded: false,
      sort_order: 0
    }], { transaction: repository.transaction });
  });

  it('blocks unsupported kitchen ticket transitions', async () => {
    const repository = buildTransactionalRepository({
      getKitchenTicketById: jest.fn().mockResolvedValue({
        status: 'ready',
        toJSON: () => ({ kitchen_ticket_id: 7, status: 'ready' })
      }),
      updateKitchenTicket: jest.fn()
    });
    const useCase = buildUpdateKitchenTicketStatusUseCase({ fnbRepository: repository });

    const result = await useCase({
      ticketId: 7,
      payload: { status: 'preparing' }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    expect(repository.updateKitchenTicket).not.toHaveBeenCalled();
  });

  it('syncs kitchen ticket progress to the related check-line statuses', async () => {
    const repository = buildTransactionalRepository({
      getKitchenTicketById: jest.fn().mockResolvedValue({
        status: 'preparing',
        toJSON: () => ({
          kitchen_ticket_id: 7,
          check_id: 12,
          status: 'preparing',
          ready_at: null,
          served_at: null,
          lines_snapshot: {
            source: 'storefront_checkout',
            lines: [
              { check_line_id: 101, item_id: 9 },
              { check_line_id: 102, item_id: 10 }
            ]
          }
        })
      }),
      updateKitchenTicket: jest.fn().mockResolvedValue({
        kitchen_ticket_id: 7,
        status: 'ready'
      }),
      updateCheckLinesStatus: jest.fn().mockResolvedValue(2)
    });
    const useCase = buildUpdateKitchenTicketStatusUseCase({ fnbRepository: repository });

    const result = await useCase({
      ticketId: 7,
      payload: { status: 'ready' }
    });

    expect(result.success).toBe(true);
    expect(repository.updateKitchenTicket).toHaveBeenCalledWith(7, expect.objectContaining({
      status: 'ready',
      ready_at: expect.any(Date)
    }), { transaction: repository.transaction });
    expect(repository.updateCheckLinesStatus).toHaveBeenCalledWith({
      checkId: 12,
      lineIds: [101, 102],
      status: 'ready'
    }, { transaction: repository.transaction });
  });

  it('stores public reservation requests with storefront source', async () => {
    const repository = {
      createReservation: jest.fn().mockResolvedValue({
        reservation_request_id: 14,
        public_reference: 'FNB-TEST',
        source: 'storefront'
      })
    };
    const useCase = buildCreateReservationUseCase({ fnbRepository: repository });

    const result = await useCase({
      source: 'storefront',
      payload: {
        public_reference: 'FNB-TEST',
        customer_name: 'Ana Cruz',
        customer_phone: '09170000000',
        party_size: 3,
        requested_at: '2026-05-06T12:00:00.000Z'
      }
    });

    expect(result.success).toBe(true);
    expect(repository.createReservation).toHaveBeenCalledWith(expect.objectContaining({
      source: 'storefront',
      customer_name: 'Ana Cruz',
      party_size: 3
    }));
  });

  it('validates assigned reservation tables before storing schedule requests', async () => {
    const repository = {
      getTableById: jest.fn().mockResolvedValue({
        table_id: 5,
        dining_area_id: 1
      }),
      createReservation: jest.fn().mockResolvedValue({
        reservation_request_id: 15,
        table_id: 5
      })
    };
    const useCase = buildCreateReservationUseCase({ fnbRepository: repository });

    const result = await useCase({
      payload: {
        customer_name: 'Ana Cruz',
        party_size: 4,
        table_id: 5,
        requested_at: '2026-05-06T12:00:00.000Z'
      }
    });

    expect(result.success).toBe(true);
    expect(repository.getTableById).toHaveBeenCalledWith(5, {});
    expect(repository.createReservation).toHaveBeenCalledWith(expect.objectContaining({
      table_id: 5,
      table_ids: [5],
      duration_minutes: 90,
      buffer_minutes: 15
    }));
  });

  it('allows combined-table reservations when the assigned seats cover party size', async () => {
    const repository = {
      getTableById: jest.fn()
        .mockResolvedValueOnce({ table_id: 5, seat_count: 4, status: 'available', is_active: true })
        .mockResolvedValueOnce({ table_id: 6, seat_count: 4, status: 'available', is_active: true }),
      createReservation: jest.fn().mockResolvedValue({
        reservation_request_id: 16,
        table_id: 5,
        table_ids: [5, 6]
      })
    };
    const useCase = buildCreateReservationUseCase({ fnbRepository: repository });

    const result = await useCase({
      payload: {
        customer_name: 'Team Dinner',
        party_size: 7,
        table_ids: [5, 6],
        requested_at: '2026-05-06T12:00:00.000Z'
      }
    });

    expect(result.success).toBe(true);
    expect(repository.createReservation).toHaveBeenCalledWith(expect.objectContaining({
      table_id: 5,
      table_ids: [5, 6],
      party_size: 7
    }));
  });

  it('rejects confirmed reservations when assigned table capacity is too small', async () => {
    const repository = buildTransactionalRepository({
      getReservationById: jest.fn().mockResolvedValue({
        toJSON: () => ({
          reservation_request_id: 24,
          table_id: null,
          status: 'requested',
          party_size: 8,
          requested_at: '2026-05-06T12:00:00.000Z',
          duration_minutes: 90,
          buffer_minutes: 15,
          reservationTables: []
        })
      }),
      getTableById: jest.fn()
        .mockResolvedValueOnce({ table_id: 5, seat_count: 4, status: 'available', is_active: true }),
      listOverlappingReservations: jest.fn(),
      updateReservation: jest.fn()
    });

    const result = await buildUpdateReservationStatusUseCase({ fnbRepository: repository })({
      reservationId: 24,
      payload: { status: 'confirmed', table_ids: [5], party_size: 8 }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    expect(repository.listOverlappingReservations).not.toHaveBeenCalled();
    expect(repository.updateReservation).not.toHaveBeenCalled();
  });

  it('rejects reservation assignments to out-of-service tables', async () => {
    const repository = {
      getTableById: jest.fn().mockResolvedValue({
        table_id: 7,
        seat_count: 6,
        status: 'out_of_service',
        is_active: true
      }),
      createReservation: jest.fn()
    };

    const result = await buildCreateReservationUseCase({ fnbRepository: repository })({
      payload: {
        customer_name: 'Maintenance Conflict',
        party_size: 2,
        table_ids: [7],
        requested_at: '2026-05-06T12:00:00.000Z'
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    expect(repository.createReservation).not.toHaveBeenCalled();
  });

  it('passes reservation schedule filters to the repository', async () => {
    const repository = {
      listReservations: jest.fn().mockResolvedValue([])
    };
    const useCase = buildListReservationsUseCase({ fnbRepository: repository });

    const result = await useCase({
      query: {
        status: 'confirmed',
        table_id: 8,
        from: '2026-05-06T00:00:00.000Z',
        to: '2026-05-07T00:00:00.000Z',
        limit: 50
      }
    });

    expect(result.success).toBe(true);
    expect(repository.listReservations).toHaveBeenCalledWith(expect.objectContaining({
      status: 'confirmed',
      tableId: 8,
      limit: 50
    }));
    expect(repository.listReservations.mock.calls[0][0].from).toBeInstanceOf(Date);
    expect(repository.listReservations.mock.calls[0][0].to).toBeInstanceOf(Date);
  });

  it('blocks confirmed reservation updates that overlap the same table window', async () => {
    const repository = buildTransactionalRepository({
      getReservationById: jest.fn().mockResolvedValue({
        toJSON: () => ({
          reservation_request_id: 20,
          table_id: 5,
          status: 'requested',
          requested_at: '2026-05-06T12:00:00.000Z',
          duration_minutes: 90,
          buffer_minutes: 15,
          party_size: 4,
          reservationTables: [{ table_id: 5 }]
        })
      }),
      getTableById: jest.fn().mockResolvedValue({ table_id: 5, seat_count: 4, status: 'available', is_active: true }),
      listOverlappingReservations: jest.fn().mockResolvedValue([
        { reservation_request_id: 21 }
      ]),
      updateReservation: jest.fn()
    });

    const result = await buildUpdateReservationStatusUseCase({ fnbRepository: repository })({
      reservationId: 20,
      payload: { status: 'confirmed', table_id: 5 }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    expect(repository.listOverlappingReservations).toHaveBeenCalledWith(expect.objectContaining({
      tableIds: [5]
    }), expect.any(Object));
    expect(repository.updateReservation).not.toHaveBeenCalled();
  });

  it('normalizes restaurant service charge settings on read and update', async () => {
    const repository = {
      getServiceChargeSetting: jest.fn().mockResolvedValue({
        setting_value: JSON.stringify({
          enabled: true,
          label: 'Service',
          rate: 150,
          taxable: 'yes'
        })
      }),
      upsertServiceChargeSetting: jest.fn().mockResolvedValue()
    };

    const getResult = await buildGetServiceChargeSettingsUseCase({ fnbRepository: repository })();
    expect(getResult.success).toBe(true);
    expect(getResult.data.service_charge).toEqual({
      enabled: true,
      label: 'Service',
      rate: 100,
      taxable: true
    });

    const updateResult = await buildUpdateServiceChargeSettingsUseCase({ fnbRepository: repository })({
      payload: {
        enabled: true,
        label: '',
        rate: -2,
        taxable: false
      }
    });
    expect(updateResult.success).toBe(true);
    expect(repository.upsertServiceChargeSetting).toHaveBeenCalledWith({
      enabled: true,
      label: 'Restaurant service charge',
      rate: 0,
      taxable: false
    });
  });
});
