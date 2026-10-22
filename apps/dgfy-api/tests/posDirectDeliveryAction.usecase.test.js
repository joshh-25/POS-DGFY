import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
  buildCompleteDirectDeliveryOrderUseCase,
  buildFailDirectDeliveryOrderUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

const makeRepository = (overrides = {}) => {
  const job = {
    delivery_job_id: 8, pos_transaction_id: 44, provider: 'manual',
    status: 'picked_up', courier_service: 'lalamove',
    assigned_by: 12, assigned_shift_id: 9, assigned_at: new Date(), ...overrides.job
  };
  const order = {
    pos_transaction_id: 44, order_source: 'online_store', order_method: 'delivery',
    fulfillment_status: 'out_for_delivery', location_id: 7,
    payment_status: 'paid', payment_type: 'online', payment_timing: 'upfront',
    total_amount: 100, amount_paid: 100, balance_due: 0,
    inventory_issued_at: new Date(), deliveryJob: job, ...overrides.order
  };
  const replay = new Map();
  const audit = [];
  return {
    order, job, audit,
    findOperationReplayByKey: jest.fn(async ({ operationKey, idempotencyKey }) => replay.get(`${operationKey}:${idempotencyKey}`) || null),
    createOperationReplay: jest.fn(async (entry) => {
      replay.set(`${entry.operation_key}:${entry.idempotency_key}`, entry);
      return entry;
    }),
    getOrderByIdForLifecycle: jest.fn(async () => ({ ...order, deliveryJob: { ...job } })),
    findOpenTerminalShift: jest.fn(async () => ({
      pos_terminal_shift_id: 9, terminal_id: 'COUNTER-01', cashier_id: 12,
      location_id: 7, status: 'open'
    })),
    updateDeliveryJobByOrderId: jest.fn(async (_id, patch) => {
      Object.assign(job, patch);
      return { ...job };
    }),
    updateOrderById: jest.fn(async (_id, patch) => {
      Object.assign(order, patch);
      return { ...order };
    }),
    createAuditLog: jest.fn(async (entry) => { audit.push(entry); return entry; }),
    findOrderPaymentEntryByKind: jest.fn(async () => ({ pos_order_payment_id: 4 })),
    createOrderPaymentEntry: jest.fn(async () => 5)
  };
};

const call = (useCase, payload) => dbStore.run({
  tenantId: 'direct-delivery-test',
  sequelize: { transaction: async () => ({
    finished: false,
    commit: async function commit() { this.finished = true; },
    rollback: async function rollback() { this.finished = true; }
  }) }
}, () => useCase({ posTransactionId: 44, payload, user: { user_id: 12 } }));

const dependencies = (repository, extras = {}) => ({
  posRepository: repository,
  activityRecorder: jest.fn(async () => null),
  dispatchOrderSmsAlert: jest.fn(async () => null),
  commerceOrderLifecycleUseCase: jest.fn(async () => ({ success: true, data: {} })),
  ...extras
});

describe('direct delivery completion and failure', () => {
  it('completes a prepaid delivery once and replays without duplicate mutation', async () => {
    const repository = makeRepository();
    const effects = dependencies(repository);
    const complete = buildCompleteDirectDeliveryOrderUseCase(effects);
    const payload = { terminal_id: 'COUNTER-01', idempotency_key: 'direct-complete-prepaid-44' };

    const result = await call(complete, payload);
    const replay = await call(complete, payload);

    expect(result.success).toBe(true);
    expect(result.data.order.fulfillment_status).toBe('completed');
    expect(repository.job.status).toBe('delivered');
    expect(replay.success).toBe(true);
    expect(replay.data.idempotent_replay).toBe(true);
    expect(repository.updateOrderById).toHaveBeenCalledTimes(1);
    expect(repository.updateDeliveryJobByOrderId).toHaveBeenCalledTimes(1);
    expect(effects.dispatchOrderSmsAlert).toHaveBeenCalledTimes(1);
    expect(repository.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity_type: 'delivery_job' }),
      expect.objectContaining({ entity_type: 'pos_transaction' })
    ]));
  });

  it('requires COD settlement, then records full cash collection with delivery', async () => {
    const repository = makeRepository({ order: {
      payment_status: 'unpaid', payment_type: 'cash', payment_timing: 'on_delivery',
      amount_paid: 0, balance_due: 100
    } });
    const complete = buildCompleteDirectDeliveryOrderUseCase(dependencies(repository));
    const missing = await call(complete, { terminal_id: 'COUNTER-01', idempotency_key: 'cod-missing-44' });
    expect(missing.success).toBe(false);
    expect(missing.error.details.reason_code).toBe('DELIVERY_BALANCE_DUE_OUTSTANDING');

    const result = await call(complete, {
      terminal_id: 'COUNTER-01', idempotency_key: 'cod-cash-44',
      settlement: { method: 'cash', amount: 120 }
    });
    expect(result.success).toBe(true);
    expect(repository.order).toMatchObject({
      fulfillment_status: 'completed', payment_status: 'paid', amount_paid: 100,
      balance_due: 0, cash_received: 120, change_amount: 20
    });
  });

  it('does not treat an unpaid non-COD order as cash on delivery', async () => {
    const repository = makeRepository({ order: {
      payment_status: 'unpaid', payment_type: 'card', payment_timing: 'on_delivery',
      amount_paid: 0, balance_due: 100
    } });
    const complete = buildCompleteDirectDeliveryOrderUseCase(dependencies(repository));
    const result = await call(complete, {
      terminal_id: 'COUNTER-01', idempotency_key: 'unpaid-card-44',
      settlement: { method: 'cash', amount: 100 }
    });

    expect(result.success).toBe(false);
    expect(result.error.details.reason_code).toBe('DELIVERY_SETTLEMENT_INVALID');
    expect(repository.order.fulfillment_status).toBe('out_for_delivery');
    expect(repository.updateOrderById).not.toHaveBeenCalled();
  });

  it('settles a captured downpayment balance in the same transaction', async () => {
    const repository = makeRepository({ order: {
      payment_status: 'partially_paid', payment_type: 'cash', payment_timing: 'on_delivery',
      amount_paid: 30, balance_due: 70
    } });
    const complete = buildCompleteDirectDeliveryOrderUseCase(dependencies(repository));
    const result = await call(complete, {
      terminal_id: 'COUNTER-01', idempotency_key: 'balance-cash-44',
      settlement: { method: 'cash', amount: 70 }
    });
    expect(result.success).toBe(true);
    expect(repository.createOrderPaymentEntry).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'balance', amount: 70, relatedPosOrderPaymentId: 4 }),
      expect.any(Object)
    );
  });

  it('fails a direct delivery, releases its reservation and triggers one store refund lifecycle', async () => {
    const repository = makeRepository({ order: { fulfillment_status: 'ready_for_rider' }, job: { status: 'assigned' } });
    const releaseOnlineOrderInventory = jest.fn(async () => null);
    const effects = dependencies(repository, { inventoryReservationService: { releaseOnlineOrderInventory } });
    const fail = buildFailDirectDeliveryOrderUseCase(effects);
    const payload = { idempotency_key: 'direct-fail-44', reason: 'Customer unavailable' };

    const result = await call(fail, payload);
    const replay = await call(fail, payload);

    expect(result.success).toBe(true);
    expect(repository.order.fulfillment_status).toBe('cancelled');
    expect(repository.job).toMatchObject({ status: 'failed', failure_reason: 'Customer unavailable' });
    expect(replay.data.idempotent_replay).toBe(true);
    expect(releaseOnlineOrderInventory).toHaveBeenCalledTimes(1);
    expect(effects.commerceOrderLifecycleUseCase).toHaveBeenCalledTimes(1);
    expect(effects.commerceOrderLifecycleUseCase).toHaveBeenCalledWith(
      expect.objectContaining({ fulfillmentStatus: 'cancelled', rejectionReason: 'Customer unavailable' })
    );
  });

  it('blocks failure for active run members', async () => {
    const repository = makeRepository({ job: { delivery_run_id: 3 } });
    const fail = buildFailDirectDeliveryOrderUseCase(dependencies(repository));
    const result = await call(fail, { idempotency_key: 'run-fail-44', reason: 'Customer unavailable' });
    expect(result.success).toBe(false);
    expect(result.error.details.reason_code).toBe('DIRECT_DELIVERY_ORDER_REQUIRED');
    expect(repository.updateDeliveryJobByOrderId).not.toHaveBeenCalled();
  });
});
