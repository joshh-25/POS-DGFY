import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
    buildUpdateOnlineOrderStatusUseCase,
    buildUpdateOnlineOrderDeliveryAddressUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

// Phase 210 (#1179): confirmed -> rejected persistence, the accepted_by/at guard, and the
// staff delivery-address/pin edit use case (pre-dispatch only, per Pat's confirmed decision).

const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const buildRepository = (seed = {}) => {
    const order = {
        pos_transaction_id: 55,
        order_source: 'online_store',
        order_method: 'delivery',
        fulfillment_status: 'confirmed',
        location_id: 7,
        cashier_id: 12,
        accepted_by: 3,
        accepted_at: new Date('2026-09-01T10:00:00Z'),
        delivery_address: 'Original address, Barangay 1',
        delivery_latitude: 14.5,
        delivery_longitude: 121.0,
        updated_at: new Date('2026-09-01T10:00:00Z'),
        ...seed
    };
    const replays = new Map();
    const addressChanges = [];
    return {
        order,
        addressChanges,
        async findOperationReplayByKey({ operationKey, idempotencyKey }) {
            return replays.get(`${operationKey}:${idempotencyKey}`) || null;
        },
        async createOperationReplay(payload) {
            replays.set(`${payload.operation_key}:${payload.idempotency_key}`, payload);
            return payload;
        },
        async getOrderByIdForLifecycle() {
            return { ...order };
        },
        async findOpenTerminalShift() {
            return {
                pos_terminal_shift_id: 9,
                terminal_id: 'COUNTER-01',
                cashier_id: 12,
                location_id: 7,
                status: 'open'
            };
        },
        async updateOrderById(_id, payload) {
            Object.assign(order, payload);
            return { ...order };
        },
        async createAddressChange(payload) {
            addressChanges.push(payload);
            return { address_change_id: addressChanges.length, ...payload };
        }
    };
};

const run = (callback) => {
    const sequelize = { transaction: jest.fn(async () => createTransaction()) };
    return dbStore.run({ tenantId: 'order-address-edit-test', sequelize }, callback);
};

describe('confirmed -> rejected online order status (Phase 210, #1179)', () => {
    it('accepts confirmed -> rejected, persists the reason/actor/timestamp, and does not overwrite accepted_by/at', async () => {
        const repository = buildRepository();
        const useCase = buildUpdateOnlineOrderStatusUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 55,
            payload: {
                fulfillment_status: 'rejected',
                reason: 'Outside our delivery route',
                idempotency_key: 'reject-1'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(repository.order.rejection_reason).toBe('Outside our delivery route');
        expect(repository.order.rejected_by).toBe(12);
        expect(repository.order.rejected_at).toBeInstanceOf(Date);
        // The accepted_by/at pair records who accepted -- a later reject must not overwrite it.
        expect(repository.order.accepted_by).toBe(3);
        expect(repository.order.accepted_at).toEqual(new Date('2026-09-01T10:00:00Z'));
    });

    it('rejects a confirmed -> rejected without a reason with 422 (validator-level)', async () => {
        // Exercised at the validator directly -- posValidator.js's updateOnlineOrderStatusSchema
        // makes `reason` required whenever fulfillment_status === 'rejected', for any origin.
        const { validateUpdateOnlineOrderStatus } = await import('../src/validators/posValidator.js');
        const req = { body: { fulfillment_status: 'rejected' } };
        let statusCode = null;
        const res = {
            status(code) { statusCode = code; return this; },
            json() { return this; }
        };
        const next = jest.fn();
        validateUpdateOnlineOrderStatus(req, res, next);
        expect(statusCode).toBe(422);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('staff delivery-address/pin edit (Phase 210, #1179) -- pre-dispatch only', () => {
    it('writes the order row and one address-change audit row on the happy path', async () => {
        const repository = buildRepository({ fulfillment_status: 'placed' });
        const useCase = buildUpdateOnlineOrderDeliveryAddressUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 55,
            payload: {
                delivery_address: 'New address, highway junction',
                delivery_latitude: 14.6,
                delivery_longitude: 121.1,
                change_reason: 'Customer requested handover at the highway',
                idempotency_key: 'addr-1'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(repository.order.delivery_address).toBe('New address, highway junction');
        expect(repository.addressChanges).toHaveLength(1);
        expect(repository.addressChanges[0]).toMatchObject({
            posTransactionId: 55,
            previousAddress: 'Original address, Barangay 1',
            previousLatitude: 14.5,
            previousLongitude: 121.0,
            newAddress: 'New address, highway junction',
            newLatitude: 14.6,
            newLongitude: 121.1,
            changeReason: 'Customer requested handover at the highway',
            changedBy: 12
        });
    });

    it('a second edit records the first edit\'s new_* values as its own previous_*', async () => {
        const repository = buildRepository({ fulfillment_status: 'preparing' });
        const useCase = buildUpdateOnlineOrderDeliveryAddressUseCase({ posRepository: repository });

        await run(() => useCase({
            posTransactionId: 55,
            payload: {
                delivery_address: 'First edit address',
                delivery_latitude: 14.6,
                delivery_longitude: 121.1,
                change_reason: 'First phone call',
                idempotency_key: 'addr-2a'
            },
            user: { user_id: 12 }
        }));

        await run(() => useCase({
            posTransactionId: 55,
            payload: {
                delivery_address: 'Second edit address',
                delivery_latitude: 14.7,
                delivery_longitude: 121.2,
                change_reason: 'Second phone call',
                idempotency_key: 'addr-2b'
            },
            user: { user_id: 12 }
        }));

        expect(repository.addressChanges).toHaveLength(2);
        expect(repository.addressChanges[1].previousAddress).toBe('First edit address');
        expect(repository.addressChanges[1].previousLatitude).toBe(14.6);
        expect(repository.addressChanges[1].previousLongitude).toBe(121.1);
    });

    it('422s a non-delivery order', async () => {
        const repository = buildRepository({ order_method: 'pickup' });
        const useCase = buildUpdateOnlineOrderDeliveryAddressUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 55,
            payload: {
                delivery_address: 'New address',
                change_reason: 'Some reason'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(422);
        expect(result.error?.details?.reason_code).toBe('ORDER_ADDRESS_EDIT_NOT_DELIVERY');
    });

    // Pat's confirmed deviation from the plan (PHASE_210_PLAN.md section 3.4): pre-dispatch only.
    // out_for_delivery is REJECTED with a 409, same as a terminal state.
    it('409s an out_for_delivery order (Pat: pre-dispatch only, not the plan-default out_for_delivery-allowed)', async () => {
        const repository = buildRepository({ fulfillment_status: 'out_for_delivery' });
        const useCase = buildUpdateOnlineOrderDeliveryAddressUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 55,
            payload: {
                delivery_address: 'New address',
                change_reason: 'Some reason'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(409);
        expect(result.error?.details?.reason_code).toBe('ORDER_ADDRESS_EDIT_TERMINAL_STATE');
    });

    it('409s a completed order', async () => {
        const repository = buildRepository({ fulfillment_status: 'completed' });
        const useCase = buildUpdateOnlineOrderDeliveryAddressUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 55,
            payload: {
                delivery_address: 'New address',
                change_reason: 'Some reason'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(409);
    });

    it('422s a latitude-without-longitude payload', async () => {
        const repository = buildRepository({ fulfillment_status: 'placed' });
        const useCase = buildUpdateOnlineOrderDeliveryAddressUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 55,
            payload: {
                delivery_address: 'New address',
                delivery_latitude: 14.6,
                change_reason: 'Some reason'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(422);
    });
});
