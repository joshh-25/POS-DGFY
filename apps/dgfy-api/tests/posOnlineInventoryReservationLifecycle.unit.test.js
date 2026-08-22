import { jest } from '@jest/globals';
import { buildUpdateOnlineOrderStatusUseCase } from '../src/modules/pos/usecases/posUseCases.js';
import dbStore from '../src/utils/dbStore.js';

const makeTransaction = () => ({
  finished: false,
  LOCK: { UPDATE: 'UPDATE' },
  commit: jest.fn(async function commit() { this.finished = true; }),
  rollback: jest.fn(async function rollback() { this.finished = true; })
});

const makeOrder = (status) => ({
  pos_transaction_id: 800,
  invoice_number: 'INV-000800',
  tracking_pin: 'SK-RESERVE8',
  order_source: 'online_store',
  order_method: 'pickup',
  fulfillment_status: status,
  payment_status: 'paid',
  location_id: 4,
  lines: [{
    line_id: 1,
    item_id: 20,
    quantity: 1,
    category: 'product',
    item: { item_id: 20, name: 'Burger', category: 'product' }
  }]
});

const buildUseCase = ({ order, nextStatus, reservationService: reservationServiceInput }) => {
  const transaction = makeTransaction();
  const updated = { ...order, fulfillment_status: nextStatus };
  const posRepository = {
    findOpenTerminalShift: jest.fn().mockResolvedValue({
      pos_terminal_shift_id: 9,
      cashier_id: 7,
      location_id: 4,
      status: 'open'
    }),
    getOrderByIdForLifecycle: jest.fn()
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(updated),
    updateOrderById: jest.fn().mockResolvedValue(updated),
    listProductCompositionsForItems: jest.fn().mockResolvedValue([])
  };
  const useCase = buildUpdateOnlineOrderStatusUseCase({
    posRepository,
    inventoryCommandService: { issueStockForOnlineFulfillment: jest.fn().mockResolvedValue({ movement_id: 1 }) },
    inventoryReservationService: reservationServiceInput,
    activityRecorder: jest.fn().mockResolvedValue(null)
  });
  const fakeSequelize = { transaction: jest.fn().mockResolvedValue(transaction) };
  return { useCase, posRepository, transaction, fakeSequelize };
};

describe('POS online inventory reservation lifecycle', () => {
  it('converts an active hold when fulfillment completes', async () => {
    const order = makeOrder('ready_for_pickup');
    const reservationService = {
      convertOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'converted' })
    };
    const { useCase, transaction, fakeSequelize } = buildUseCase({
      order,
      nextStatus: 'completed',
      reservationService
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'completed' },
      user: { user_id: 7 }
    }));

    expect(result.success).toBe(true);
    expect(reservationService.convertOnlineOrderInventory).toHaveBeenCalledWith({
      sourceId: 800,
      transaction
    });
  });

  it('releases an active hold when the POS rejects an order', async () => {
    const order = makeOrder('placed');
    const reservationService = {
      releaseOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'released' })
    };
    const { useCase, transaction, fakeSequelize } = buildUseCase({
      order,
      nextStatus: 'rejected',
      reservationService
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'rejected' },
      user: { user_id: 7 }
    }));

    expect(result.success).toBe(true);
    expect(reservationService.releaseOnlineOrderInventory).toHaveBeenCalledWith({
      sourceId: 800,
      transaction,
      reason: 'rejected'
    });
  });
});
