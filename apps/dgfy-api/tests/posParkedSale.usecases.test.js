import { afterEach, describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
    buildCancelPosParkedSaleUseCase,
    buildClaimPosParkedSaleUseCase,
    buildCompleteClaimedPosParkedSaleUseCase,
    buildCreatePosParkedSaleUseCase,
    buildListPosParkedSalesUseCase,
    buildReparkPosParkedSaleUseCase
} from '../src/modules/pos/usecases/parkedSaleUseCases.js';

const basePayload = () => ({
    idempotency_key: 'park-request-001',
    shift_id: 41,
    terminal_id: 'counter-01',
    location_id: 3,
    snapshot: {
        customer_name: 'Walk-in',
        lines: [{
            item_id: 7,
            quantity: 2,
            sale_price: 125.5,
            manager_pin: '1234',
            metadata: { access_token: 'do-not-store', note: 'no secret' }
        }]
    },
    subtotal_amount: 251,
    total_amount: 251
});

const buildTransaction = () => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = 'commit'; }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; })
    };
    return transaction;
};

const buildHarness = ({ shift = {}, parkedSale = null, parkedSales = [] } = {}) => {
    const transaction = buildTransaction();
    const posRepository = {
        getTerminalShiftById: jest.fn().mockResolvedValue({
            pos_terminal_shift_id: 41,
            status: 'open',
            cashier_id: 15,
            terminal_id: 'COUNTER-01',
            location_id: 3,
            ...shift
        }),
        findParkedSaleByIdempotencyKey: jest.fn().mockResolvedValue(parkedSale),
        createParkedSale: jest.fn(async (payload) => ({
            pos_parked_sale_id: 101,
            created_at: new Date().toISOString(),
            ...payload
        })),
        getParkedSaleById: jest.fn().mockResolvedValue(parkedSale),
        updateParkedSale: jest.fn(async (id, payload) => ({
            ...(parkedSale || { pos_parked_sale_id: id, shift_id: 41, cashier_id: 15, location_id: 3, status: 'parked' }),
            ...payload
        })),
        listParkedSales: jest.fn().mockResolvedValue(parkedSales)
    };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };
    return { posRepository, sequelize, transaction };
};

const runInTenant = (sequelize, callback) => dbStore.run({ sequelize }, callback);

afterEach(() => jest.restoreAllMocks());

describe('parked sale use cases', () => {
    it('parks an immutable snapshot and scrubs secrets before persistence', async () => {
        const harness = buildHarness();
        const useCase = buildCreatePosParkedSaleUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            payload: basePayload(),
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.status).toBe('parked');
        expect(result.data.idempotent_replay).toBe(false);
        expect(result.data.snapshot.lines[0]).not.toHaveProperty('manager_pin');
        expect(result.data.snapshot.lines[0].metadata).not.toHaveProperty('access_token');
        expect(harness.posRepository.createParkedSale).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'parked',
                shift_id: 41,
                cashier_id: 15,
                terminal_id: 'COUNTER-01',
                location_id: 3,
                line_count: 1,
                quantity_total: 2
            }),
            expect.objectContaining({ transaction: harness.transaction })
        );
        expect(harness.transaction.commit).toHaveBeenCalledTimes(1);
        expect(harness.transaction.rollback).not.toHaveBeenCalled();
    });

    it('replays the same idempotent park request without creating a duplicate', async () => {
        const harness = buildHarness();
        const useCase = buildCreatePosParkedSaleUseCase({ posRepository: harness.posRepository });
        const first = await runInTenant(harness.sequelize, () => useCase({ payload: basePayload(), user: { user_id: 15 } }));
        const stored = first.data;
        harness.posRepository.findParkedSaleByIdempotencyKey.mockResolvedValue(stored);
        harness.posRepository.createParkedSale.mockClear();

        const replay = await runInTenant(harness.sequelize, () => useCase({ payload: basePayload(), user: { user_id: 15 } }));

        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(harness.posRepository.createParkedSale).not.toHaveBeenCalled();
    });

    it('parses MariaDB JSON text when listing parked sales', async () => {
        const snapshot = {
            order_method: 'dine_in',
            lines: [{ item_id: 7, item_name: 'Burger Meal', quantity: 1, sale_price: 150 }]
        };
        const harness = buildHarness({ parkedSales: [{
            pos_parked_sale_id: 101,
            park_reference: 'PARK-298577B413F6',
            status: 'parked',
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            snapshot: JSON.stringify(snapshot),
            line_count: 0
        }] });
        const useCase = buildListPosParkedSalesUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            query: { shift_id: 41, location_id: 3 },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.parked_sales[0]).toEqual(expect.objectContaining({
            line_count: 1,
            snapshot
        }));
    });

    it('returns parsed MariaDB JSON text after claiming a parked sale', async () => {
        const snapshot = {
            lines: [{ item_id: 9, item_name: 'Chicken Frankie Roll', quantity: 1, sale_price: 150 }]
        };
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'parked',
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            snapshot: JSON.stringify(JSON.stringify(snapshot)),
            line_count: 1
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildClaimPosParkedSaleUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            status: 'claimed',
            line_count: 1,
            snapshot
        }));
    });

    it('rejects an idempotency key reused with a different snapshot', async () => {
        const harness = buildHarness({ parkedSale: { request_hash: 'different-hash' } });
        const useCase = buildCreatePosParkedSaleUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            payload: basePayload(),
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PARKED_SALE_IDEMPOTENCY_CONFLICT' }));
        expect(harness.transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it('denies a cashier from claiming another cashier\'s parked sale', async () => {
        const harness = buildHarness({ shift: { cashier_id: 22 }, parkedSale: {
            pos_parked_sale_id: 101,
            status: 'parked',
            shift_id: 41,
            cashier_id: 15,
            location_id: 3
        } });
        const useCase = buildClaimPosParkedSaleUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01' },
            user: { user_id: 22 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(harness.posRepository.updateParkedSale).not.toHaveBeenCalled();
    });

    it('cancels a parked sale with an auditable reason', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'parked',
            shift_id: 41,
            cashier_id: 15,
            location_id: 3
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildCancelPosParkedSaleUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', reason: 'Customer changed order' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.status).toBe('cancelled');
        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(
            101,
            expect.objectContaining({
                status: 'cancelled',
                cancelled_by: 15,
                cancel_reason: 'Customer changed order'
            }),
            expect.objectContaining({ transaction: harness.transaction, lock: true })
        );
    });

    it('updates the same claimed parked sale and increments its revision', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            park_reference: 'PARK-ABC123',
            status: 'claimed',
            revision: 2,
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            claimed_by: 15,
            claimed_terminal_id: 'COUNTER-01'
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildReparkPosParkedSaleUseCase({ posRepository: harness.posRepository });
        const payload = basePayload();
        delete payload.idempotency_key;
        payload.expected_revision = 2;

        const result = await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload,
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            pos_parked_sale_id: 101,
            park_reference: 'PARK-ABC123',
            status: 'parked',
            revision: 3
        }));
        expect(harness.posRepository.createParkedSale).not.toHaveBeenCalled();
        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(101, expect.objectContaining({
            revision: 3,
            status: 'parked',
            claimed_by: null,
            line_count: 1
        }), expect.objectContaining({ transaction: harness.transaction, lock: true }));
    });

    it('rejects a stale re-park revision without overwriting the parked sale', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'claimed',
            revision: 3,
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            claimed_by: 15,
            claimed_terminal_id: 'COUNTER-01'
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildReparkPosParkedSaleUseCase({ posRepository: harness.posRepository });
        const payload = basePayload();
        delete payload.idempotency_key;
        payload.expected_revision = 2;

        const result = await runInTenant(harness.sequelize, () => useCase({ parkedSaleId: 101, payload, user: { user_id: 15 } }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PARKED_SALE_REVISION_CONFLICT' }));
        expect(harness.posRepository.updateParkedSale).not.toHaveBeenCalled();
    });

    it('completes a claimed parked sale inside the checkout transaction', async () => {
        const parkedSale = {
            pos_parked_sale_id: 101,
            status: 'claimed',
            revision: 1,
            shift_id: 41,
            cashier_id: 15,
            location_id: 3,
            claimed_by: 15,
            claimed_terminal_id: 'COUNTER-01'
        };
        const harness = buildHarness({ parkedSale });
        const useCase = buildCompleteClaimedPosParkedSaleUseCase({ posRepository: harness.posRepository });

        await runInTenant(harness.sequelize, () => useCase({
            parkedSaleId: 101,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', location_id: 3 },
            user: { user_id: 15 },
            transactionId: 9001,
            transaction: harness.transaction
        }));

        expect(harness.posRepository.updateParkedSale).toHaveBeenCalledWith(101, expect.objectContaining({
            status: 'completed',
            completed_transaction_id: 9001
        }), expect.objectContaining({ transaction: harness.transaction, lock: true }));
    });
});
