// Unit tests for #1931: a post-acceptance customer cancel reverses a Retail online order's
// accept-time goods-issue exactly once, through the Inventory-owned reversal command, inside
// the same transaction as the status update.
//
// No database anywhere in this file. storeRepository is a hand-built fake mirroring
// storeCancelVoucherReversal.unit.test.js's own shape; the reversal command and the workflow
// mode resolver are injected fakes. The voucher/payment lifecycle legs are left unwired
// (null), the same way storeCancelDownpaymentLifecycle.unit.test.js builds this use case.

import { describe, expect, it, jest } from '@jest/globals';
import { buildCancelStoreOrderUseCase } from '../src/modules/store/usecases/storeUseCases.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TRACKING_PIN = 'SK-CANCEL';
const ORDER_ID = 904;

const makeTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const baseOrder = (overrides = {}) => ({
    pos_transaction_id: ORDER_ID,
    tracking_pin: TRACKING_PIN,
    store_customer_id: 55,
    fulfillment_status: 'confirmed',
    inventory_issued_at: new Date('2026-09-16T10:00:00.000Z'),
    inventory_reversed_at: null,
    ...overrides
});

const build = ({ order = baseOrder(), workflowMode = 'retail', reverseImpl = null } = {}) => {
    const transaction = makeTransaction();
    const storeRepository = {
        beginTransaction: jest.fn().mockResolvedValue(transaction),
        getOrderByTrackingPin: jest.fn()
            .mockResolvedValueOnce(order)
            .mockResolvedValueOnce({ ...order, fulfillment_status: 'cancelled' }),
        updateOrderByTrackingPin: jest.fn().mockResolvedValue({ ...order, fulfillment_status: 'cancelled' })
    };
    const inventoryReservationService = { releaseOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'released' }) };
    const reverseOnlineOrderGoodsIssue = reverseImpl || jest.fn().mockResolvedValue([{ movement_id: 11 }]);
    const inventoryCommandService = { reverseOnlineOrderGoodsIssue };
    const resolveWorkflowCapabilitySettings = jest.fn().mockResolvedValue({ mode: workflowMode, enabledCapabilities: [] });

    const useCase = buildCancelStoreOrderUseCase({
        storeRepository,
        inventoryReservationService,
        inventoryCommandService,
        resolveWorkflowCapabilitySettings
    });

    return { useCase, transaction, storeRepository, inventoryReservationService, reverseOnlineOrderGoodsIssue, resolveWorkflowCapabilitySettings };
};

const run = (fixture, overrides = {}) => fixture.useCase({
    trackingPin: TRACKING_PIN,
    tenantId: TENANT_ID,
    storeCustomer: { customer_id: 55 },
    payload: {},
    ...overrides
});

describe('storefront cancel reverses a Retail accept-time goods-issue (#1931)', () => {
    it('reverses the recorded deduction once and stamps inventory_reversed_at', async () => {
        const fixture = build();

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(fixture.reverseOnlineOrderGoodsIssue).toHaveBeenCalledTimes(1);
        expect(fixture.reverseOnlineOrderGoodsIssue).toHaveBeenCalledWith(
            expect.objectContaining({ order_id: ORDER_ID }),
            null,
            fixture.transaction
        );
        expect(fixture.storeRepository.updateOrderByTrackingPin).toHaveBeenCalledWith(
            TRACKING_PIN,
            { fulfillment_status: 'cancelled', inventory_reversed_at: expect.any(Date) },
            { transaction: fixture.transaction }
        );
        expect(fixture.transaction.commit).toHaveBeenCalledTimes(1);
    });

    it('does not reverse on a pre-acceptance placed cancel, even in Retail mode', async () => {
        const fixture = build({ order: baseOrder({ fulfillment_status: 'placed', inventory_issued_at: null }) });

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(fixture.reverseOnlineOrderGoodsIssue).not.toHaveBeenCalled();
        expect(fixture.resolveWorkflowCapabilitySettings).not.toHaveBeenCalled();
        expect(fixture.storeRepository.updateOrderByTrackingPin).toHaveBeenCalledWith(
            TRACKING_PIN,
            { fulfillment_status: 'cancelled' },
            { transaction: fixture.transaction }
        );
    });

    it('does not reverse for a non-Retail order even with prior evidence set', async () => {
        const fixture = build({ workflowMode: 'fnb' });

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(fixture.reverseOnlineOrderGoodsIssue).not.toHaveBeenCalled();
        expect(fixture.storeRepository.updateOrderByTrackingPin).toHaveBeenCalledWith(
            TRACKING_PIN,
            { fulfillment_status: 'cancelled' },
            { transaction: fixture.transaction }
        );
    });

    it('does not reverse twice when inventory_reversed_at is already set', async () => {
        const fixture = build({ order: baseOrder({ inventory_reversed_at: new Date('2026-09-16T11:00:00.000Z') }) });

        const result = await run(fixture);

        expect(result.success).toBe(true);
        expect(fixture.reverseOnlineOrderGoodsIssue).not.toHaveBeenCalled();
    });

    it('rolls the ENTIRE cancellation back when the reversal fails', async () => {
        const fixture = build({
            reverseImpl: jest.fn().mockRejectedValue(new Error('FIFO batch already consumed downstream'))
        });

        const result = await run(fixture);

        expect(result.success).toBe(false);
        expect(fixture.storeRepository.updateOrderByTrackingPin).not.toHaveBeenCalled();
        expect(fixture.transaction.rollback).toHaveBeenCalledTimes(1);
        expect(fixture.transaction.commit).not.toHaveBeenCalled();
    });
});
