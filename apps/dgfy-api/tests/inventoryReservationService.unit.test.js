import { jest } from '@jest/globals';
import { buildInventoryReservationService } from '../src/modules/inventory/services/inventoryReservationService.js';

const transaction = { LOCK: { UPDATE: 'UPDATE' } };

const buildFakeModels = ({ stock = [] } = {}) => {
  const reservations = [];
  const lines = [];
  let nextReservationId = 1;

  const InventoryReservation = {
    update: jest.fn(async (payload, options) => {
      for (const row of reservations) {
        const matches = row.status === options.where.status
          && row.source_type === options.where.source_type
          && row.expires_at <= options.where.expires_at[Object.getOwnPropertySymbols(options.where.expires_at)[0]];
        if (matches) Object.assign(row, payload);
      }
    }),
    findOne: jest.fn(async ({ where }) => reservations.find((row) => (
      row.source_type === where.source_type && row.source_id === where.source_id
    )) || null),
    create: jest.fn(async (payload) => {
      const row = {
        ...payload,
        inventory_reservation_id: nextReservationId++,
        update: jest.fn(async (changes) => Object.assign(row, changes))
      };
      reservations.push(row);
      return row;
    }),
    _rows: reservations
  };
  const InventoryReservationLine = {
    findAll: jest.fn(async ({ where }) => lines.filter((row) => where.item_id[Object.getOwnPropertySymbols(where.item_id)[0]].includes(row.item_id)
      && reservations.some((reservation) => reservation.inventory_reservation_id === row.inventory_reservation_id
        && reservation.status === 'active'
        && reservation.location_id === 4
        && reservation.expires_at > new Date()))),
    bulkCreate: jest.fn(async (rows) => {
      lines.push(...rows);
      return rows;
    }),
    _rows: lines
  };
  const ItemLocationStock = {
    findAll: jest.fn(async () => stock)
  };
  return { InventoryReservation, InventoryReservationLine, ItemLocationStock };
};

describe('inventory reservation service', () => {
  it('holds location stock and rejects a concurrent oversell', async () => {
    const models = buildFakeModels({ stock: [{ item_id: 10, quantity_on_hand: 5 }] });
    const service = buildInventoryReservationService({ resolveModels: () => models });

    const first = await service.reserveOnlineOrderInventory({
      sourceId: 101,
      locationId: 4,
      effects: [{ item_id: 10, quantity: 4, effect_type: 'line_item', source_line_reference: 'ONLINE:101:1' }],
      transaction
    });
    expect(first.status).toBe('active');
    expect(models.InventoryReservationLine.bulkCreate).toHaveBeenCalledTimes(1);

    await expect(service.reserveOnlineOrderInventory({
      sourceId: 102,
      locationId: 4,
      effects: [{ item_id: 10, quantity: 2, effect_type: 'line_item', source_line_reference: 'ONLINE:102:1' }],
      transaction
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: expect.objectContaining({ reason_code: 'ONLINE_STOCK_RESERVATION_SHORTFALL' })
    });
  });

  it('releases and converts only active reservations', async () => {
    const models = buildFakeModels({ stock: [{ item_id: 10, quantity_on_hand: 5 }] });
    const service = buildInventoryReservationService({ resolveModels: () => models });

    await service.reserveOnlineOrderInventory({
      sourceId: 201,
      locationId: 4,
      effects: [{ item_id: 10, quantity: 1, effect_type: 'line_item', source_line_reference: 'ONLINE:201:1' }],
      transaction
    });
    const released = await service.releaseOnlineOrderInventory({ sourceId: 201, transaction, reason: 'cancelled' });
    expect(released.status).toBe('released');
    expect(models.InventoryReservation._rows[0].release_reason).toBe('cancelled');

    await service.reserveOnlineOrderInventory({
      sourceId: 202,
      locationId: 4,
      effects: [{ item_id: 10, quantity: 1, effect_type: 'line_item', source_line_reference: 'ONLINE:202:1' }],
      transaction
    });
    const converted = await service.convertOnlineOrderInventory({ sourceId: 202, transaction });
    expect(converted.status).toBe('converted');
    expect(models.InventoryReservation._rows[1].converted_at).toBeInstanceOf(Date);
  });

  it('preserves inventory quantities to the migration precision', async () => {
    const models = buildFakeModels({ stock: [{ item_id: 10, quantity_on_hand: 0.123456789012 }] });
    const service = buildInventoryReservationService({ resolveModels: () => models });

    await service.reserveOnlineOrderInventory({
      sourceId: 301,
      locationId: 4,
      effects: [{ item_id: 10, quantity: 0.123456789012, effect_type: 'line_item', source_line_reference: 'ONLINE:301:1' }],
      transaction
    });

    expect(models.InventoryReservationLine.bulkCreate.mock.calls[0][0][0].quantity).toBe(0.123456789012);
  });
});
