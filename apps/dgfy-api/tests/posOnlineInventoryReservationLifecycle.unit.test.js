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

const buildUseCase = ({ order, nextStatus, reservationService: reservationServiceInput, workflowMode = 'fnb', inventoryCommandService: inventoryCommandServiceInput = null }) => {
  const transaction = makeTransaction();
  const updated = { ...order, fulfillment_status: nextStatus };
  const issueStockForOnlineFulfillment = jest.fn().mockResolvedValue({ movement_id: 1 });
  const reverseOnlineOrderGoodsIssue = jest.fn().mockResolvedValue([{ movement_id: 9 }]);
  const inventoryCommandService = {
    issueStockForOnlineFulfillment,
    reverseOnlineOrderGoodsIssue,
    ...(inventoryCommandServiceInput || {})
  };
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
    inventoryCommandService,
    inventoryReservationService: reservationServiceInput,
    // #1931: the tenant workflow mode gates Retail's accept-time issue; pin it per test.
    resolveWorkflowCapabilitySettings: jest.fn().mockResolvedValue({ mode: workflowMode, enabledCapabilities: [] }),
    activityRecorder: jest.fn().mockResolvedValue(null)
  });
  const fakeSequelize = { transaction: jest.fn().mockResolvedValue(transaction) };
  return { useCase, posRepository, transaction, fakeSequelize, issueStockForOnlineFulfillment, reverseOnlineOrderGoodsIssue };
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

// #1931: Retail accept-time goods-issue -- placed -> confirmed deducts immediately, exactly
// once, for Retail only; completion skips when the evidence is already set and still deducts
// for legacy (pre-change) orders that have none.
describe('POS retail accept-time inventory issue (#1931)', () => {
  it('issues stock and converts the hold at acceptance for a Retail order', async () => {
    const order = makeOrder('placed');
    const reservationService = {
      convertOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'converted' })
    };
    const { useCase, posRepository, transaction, fakeSequelize, issueStockForOnlineFulfillment } = buildUseCase({
      order,
      nextStatus: 'confirmed',
      reservationService,
      workflowMode: 'retail'
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'confirmed' },
      user: { user_id: 7 }
    }));

    expect(result.success).toBe(true);
    expect(issueStockForOnlineFulfillment).toHaveBeenCalledTimes(1);
    expect(issueStockForOnlineFulfillment).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 20, movement_type: 'goods_issue' }),
      7,
      transaction
    );
    expect(reservationService.convertOnlineOrderInventory).toHaveBeenCalledWith({
      sourceId: 800,
      transaction
    });
    expect(posRepository.updateOrderById).toHaveBeenCalledWith(
      800,
      expect.objectContaining({ fulfillment_status: 'confirmed', inventory_issued_at: expect.any(Date) }),
      expect.objectContaining({ transaction, lock: true })
    );
  });

  it('deducts at acceptance even when the order is scheduled for later', async () => {
    const order = { ...makeOrder('placed'), scheduled_for: '2026-09-20T10:30:00.000Z' };
    const reservationService = {
      convertOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'converted' })
    };
    const { useCase, fakeSequelize, issueStockForOnlineFulfillment } = buildUseCase({
      order,
      nextStatus: 'confirmed',
      reservationService,
      workflowMode: 'retail'
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'confirmed' },
      user: { user_id: 7 }
    }));

    expect(result.success).toBe(true);
    expect(issueStockForOnlineFulfillment).toHaveBeenCalledTimes(1);
  });

  it('does not issue stock at acceptance for a non-Retail order', async () => {
    const order = makeOrder('placed');
    const reservationService = {
      convertOnlineOrderInventory: jest.fn()
    };
    const { useCase, posRepository, fakeSequelize, issueStockForOnlineFulfillment } = buildUseCase({
      order,
      nextStatus: 'confirmed',
      reservationService,
      workflowMode: 'fnb'
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'confirmed' },
      user: { user_id: 7 }
    }));

    expect(result.success).toBe(true);
    expect(issueStockForOnlineFulfillment).not.toHaveBeenCalled();
    expect(reservationService.convertOnlineOrderInventory).not.toHaveBeenCalled();
    expect(posRepository.updateOrderById).toHaveBeenCalledWith(
      800,
      expect.not.objectContaining({ inventory_issued_at: expect.anything() }),
      expect.objectContaining({ lock: true })
    );
  });

  it('does not re-issue at completion when the accept-time issue already ran', async () => {
    const order = { ...makeOrder('ready_for_pickup'), inventory_issued_at: new Date('2026-09-16T10:00:00.000Z') };
    const reservationService = {
      convertOnlineOrderInventory: jest.fn()
    };
    const { useCase, fakeSequelize, issueStockForOnlineFulfillment } = buildUseCase({
      order,
      nextStatus: 'completed',
      reservationService,
      workflowMode: 'retail'
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'completed' },
      user: { user_id: 7 }
    }));

    expect(result.success).toBe(true);
    expect(issueStockForOnlineFulfillment).not.toHaveBeenCalled();
    expect(reservationService.convertOnlineOrderInventory).not.toHaveBeenCalled();
  });

  it('still deducts at completion for a legacy Retail order with no prior evidence', async () => {
    const order = makeOrder('ready_for_pickup');
    const reservationService = {
      convertOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'converted' })
    };
    const { useCase, posRepository, fakeSequelize, issueStockForOnlineFulfillment } = buildUseCase({
      order,
      nextStatus: 'completed',
      reservationService,
      workflowMode: 'retail'
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'completed' },
      user: { user_id: 7 }
    }));

    expect(result.success).toBe(true);
    expect(issueStockForOnlineFulfillment).toHaveBeenCalledTimes(1);
    expect(posRepository.updateOrderById).toHaveBeenCalledWith(
      800,
      expect.objectContaining({ fulfillment_status: 'completed', inventory_issued_at: expect.any(Date) }),
      expect.objectContaining({ lock: true })
    );
  });

  it('issues exactly once across a retried Accept with a different idempotency key', async () => {
    const issuedAt = new Date('2026-09-16T10:00:00.000Z');
    const placed = makeOrder('placed');
    const confirmed = { ...placed, fulfillment_status: 'confirmed', accepted_by: 7, accepted_at: issuedAt, inventory_issued_at: issuedAt };
    const transaction = makeTransaction();
    const issueStockForOnlineFulfillment = jest.fn().mockResolvedValue({ movement_id: 1 });
    const reservationService = {
      convertOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'converted' })
    };
    const posRepository = {
      findOpenTerminalShift: jest.fn().mockResolvedValue({
        pos_terminal_shift_id: 9,
        cashier_id: 7,
        location_id: 4,
        status: 'open'
      }),
      // No stored replay rows: each idempotency key executes for real, so the
      // transition-edge guard (not key matching) is what prevents double issue.
      findOperationReplayByKey: jest.fn().mockResolvedValue(null),
      createOperationReplay: jest.fn().mockResolvedValue({}),
      // First Accept reads `placed`, then re-reads `confirmed`; the retry reads `confirmed`
      // (already issued), then re-reads it again.
      getOrderByIdForLifecycle: jest.fn()
        .mockResolvedValueOnce(placed)
        .mockResolvedValueOnce(confirmed)
        .mockResolvedValueOnce(confirmed)
        .mockResolvedValueOnce(confirmed),
      updateOrderById: jest.fn()
        .mockResolvedValueOnce(confirmed)
        .mockResolvedValueOnce(confirmed),
      listProductCompositionsForItems: jest.fn().mockResolvedValue([])
    };
    const useCase = buildUpdateOnlineOrderStatusUseCase({
      posRepository,
      inventoryCommandService: { issueStockForOnlineFulfillment },
      inventoryReservationService: reservationService,
      resolveWorkflowCapabilitySettings: jest.fn().mockResolvedValue({ mode: 'retail', enabledCapabilities: [] }),
      activityRecorder: jest.fn().mockResolvedValue(null)
    });
    const fakeSequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    const first = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'confirmed', idempotency_key: 'accept-key-A' },
      user: { user_id: 7 }
    }));
    const retry = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'confirmed', idempotency_key: 'accept-key-B' },
      user: { user_id: 7 }
    }));

    // The transition-edge guard (not idempotency-key matching) prevents the double deduction:
    // the retry finds the order already `confirmed` with evidence set, so it succeeds as a
    // no-op without issuing again or restamping the evidence.
    expect(first.success).toBe(true);
    expect(retry.success).toBe(true);
    expect(issueStockForOnlineFulfillment).toHaveBeenCalledTimes(1);
    expect(posRepository.updateOrderById).toHaveBeenLastCalledWith(
      800,
      expect.not.objectContaining({ inventory_issued_at: expect.anything() }),
      expect.objectContaining({ transaction, lock: true })
    );
  });
});

// #1931: one-time reversal -- confirmed -> rejected restores the accepted quantity once for
// Retail orders with recorded evidence; pre-acceptance rejects and non-Retail modes never
// add stock.
describe('POS retail post-acceptance rejection reversal (#1931)', () => {
  it('reverses the accept-time issue once on staff reject after acceptance', async () => {
    const order = { ...makeOrder('confirmed'), inventory_issued_at: new Date('2026-09-16T10:00:00.000Z') };
    const reservationService = {
      releaseOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'released' })
    };
    const { useCase, posRepository, transaction, fakeSequelize, reverseOnlineOrderGoodsIssue } = buildUseCase({
      order,
      nextStatus: 'rejected',
      reservationService,
      workflowMode: 'retail'
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'rejected', reason: 'Out of route' },
      user: { user_id: 7 }
    }));

    expect(result.success).toBe(true);
    expect(reverseOnlineOrderGoodsIssue).toHaveBeenCalledTimes(1);
    expect(reverseOnlineOrderGoodsIssue).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: 800 }),
      7,
      transaction
    );
    expect(posRepository.updateOrderById).toHaveBeenCalledWith(
      800,
      expect.objectContaining({ fulfillment_status: 'rejected', inventory_reversed_at: expect.any(Date) }),
      expect.objectContaining({ transaction, lock: true })
    );
  });

  it('does not reverse on a pre-acceptance placed -> rejected, even in Retail mode', async () => {
    const order = makeOrder('placed');
    const reservationService = {
      releaseOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'released' })
    };
    const { useCase, fakeSequelize, reverseOnlineOrderGoodsIssue } = buildUseCase({
      order,
      nextStatus: 'rejected',
      reservationService,
      workflowMode: 'retail'
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'rejected', reason: 'No stock' },
      user: { user_id: 7 }
    }));

    expect(result.success).toBe(true);
    expect(reverseOnlineOrderGoodsIssue).not.toHaveBeenCalled();
  });

  it('does not reverse for a non-Retail order even with prior evidence set', async () => {
    const order = { ...makeOrder('confirmed'), inventory_issued_at: new Date('2026-09-16T10:00:00.000Z') };
    const reservationService = {
      releaseOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'released' })
    };
    const { useCase, fakeSequelize, reverseOnlineOrderGoodsIssue } = buildUseCase({
      order,
      nextStatus: 'rejected',
      reservationService,
      workflowMode: 'fnb'
    });

    const result = await dbStore.run({ sequelize: fakeSequelize }, () => useCase({
      posTransactionId: 800,
      payload: { fulfillment_status: 'rejected', reason: 'No stock' },
      user: { user_id: 7 }
    }));

    expect(result.success).toBe(true);
    expect(reverseOnlineOrderGoodsIssue).not.toHaveBeenCalled();
  });
});
