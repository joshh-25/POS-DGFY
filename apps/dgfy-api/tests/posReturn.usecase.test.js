import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildReturnPosTransactionUseCase } from '../src/modules/pos/usecases/returnUseCases.js';
import { hashFiscalEvidence } from '../src/modules/pos/domain/fiscalEvidenceContract.js';

const buildFiscalSnapshot = () => ({
    template_version: 'fiscal-receipt-v1',
    source_timezone: 'Asia/Manila',
    issued_at: '2026-10-03T12:00:00.000Z',
    document: {
        invoice_number: 'INV-RETURN-001',
        document_type: 'fiscal_invoice',
        document_context: 'fiscal'
    },
    seller: { taxpayer_type: 'VAT_REGISTERED', software_name: 'DGFY POS' },
    terminal: { terminal_id: 'TERM-01' },
    buyer: { name: null },
    totals: {
        subtotal_amount: 200,
        vatable_sales: 178.57,
        vat_amount: 21.43,
        vat_exempt_sales: 0,
        zero_rated_sales: 0,
        discount_amount: 0,
        total_amount: 200,
        payment_type: 'cash'
    },
    payment_breakdown: [{ payment_type: 'cash', amount: 200 }],
    lines: [{ line_id: '1', item_id: 101, quantity: 2, line_subtotal: 200, sale_price: 100 }]
});

const buildOriginalTransaction = () => {
    const fiscal_document_snapshot = buildFiscalSnapshot();
    return {
        pos_transaction_id: 901,
        invoice_number: 'INV-RETURN-001',
        document_type: 'fiscal_invoice',
        document_context: 'fiscal',
        status: 'completed',
        cashier_id: 12,
        shift_id: 801,
        terminal_id: 'TERM-01',
        location_id: 3,
        payment_type: 'cash',
        fiscal_document_snapshot,
        fiscal_document_hash: hashFiscalEvidence(fiscal_document_snapshot),
        lines: [{
            line_id: 1,
            item_id: 101,
            item_name_snapshot: 'Test item',
            quantity: 2,
            sale_price: 100,
            line_subtotal: 200,
            stock_effect_type: 'deduct'
        }]
    };
};

const buildTransactionContext = () => {
    const transaction = {
        finished: false,
        async commit() { this.finished = true; },
        async rollback() { this.finished = true; }
    };
    const sequelize = { transaction: jest.fn(async () => transaction) };
    return { transaction, sequelize };
};

const runWithTransaction = (sequelize, callback) => dbStore.run({ sequelize }, callback);

const buildRepository = ({ original = buildOriginalTransaction() } = {}) => {
    let storedAdjustment = null;
    const repository = {
        getTransactionById: jest.fn(async () => original),
        getTerminalShiftById: jest.fn(async () => ({
            status: 'open',
            cashier_id: 12,
            terminal_id: 'TERM-01',
            location_id: 3
        })),
        findPosTransactionAdjustmentByIdempotencyKey: jest.fn(async () => storedAdjustment),
        createFiscalEvent: jest.fn(async (payload) => ({ ...payload, event_hash: 'fiscal-event-hash' })),
        createPosTransactionAdjustment: jest.fn(async (payload) => {
            storedAdjustment = {
                pos_transaction_adjustment_id: 5001,
                ...payload
            };
            return storedAdjustment;
        }),
        createAuditLog: jest.fn(async () => null)
    };
    return { repository, getStoredAdjustment: () => storedAdjustment };
};

describe('POS transaction return adjustment evidence', () => {
    it('records a linked return without mutating the original or automatically refunding payment/inventory', async () => {
        const { sequelize } = buildTransactionContext();
        const { repository } = buildRepository();
        const useCase = buildReturnPosTransactionUseCase({ posRepository: repository });
        const original = await repository.getTransactionById();

        const result = await runWithTransaction(sequelize, () => useCase({
            posTransactionId: 901,
            payload: {
                idempotency_key: 'return-request-001',
                shift_id: 801,
                terminal_id: 'TERM-01',
                terminal_location_id: 3,
                reason: 'Customer returned one item',
                returned_lines: [{ line_id: 1, quantity: 1 }]
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.transaction).toBe(original);
        expect(result.data.adjustment).toEqual(expect.objectContaining({
            adjustment_type: 'return',
            amount: 100,
            status: 'succeeded'
        }));
        expect(result.data.adjustment_document).toEqual(expect.objectContaining({
            e_journal_record_type: 'ADJUSTMENT',
            document_label: 'RETURN',
            signed_amount: -100,
            original_document: expect.objectContaining({
                original_document_number: 'INV-RETURN-001',
                immutable: true,
                snapshot_integrity: 'verified'
            })
        }));
        expect(result.data.payment_refund).toEqual({ status: 'separate_adjustment_required' });
        expect(result.data.inventory_reversal).toEqual({ status: 'not_requested' });
        expect(repository.createFiscalEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'reversal',
            payload: expect.objectContaining({ adjustment_type: 'return' })
        }), expect.any(Object));
        expect(repository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'pos_transaction_returned'
        }), expect.any(Object));
    });

    it('replays the same return idempotently and rejects a different request under the same key', async () => {
        const { sequelize } = buildTransactionContext();
        const { repository, getStoredAdjustment } = buildRepository();
        const useCase = buildReturnPosTransactionUseCase({ posRepository: repository });
        const payload = {
            idempotency_key: 'return-request-002',
            shift_id: 801,
            terminal_id: 'TERM-01',
            terminal_location_id: 3,
            reason: 'Customer returned one item',
            returned_lines: [{ line_id: 1, quantity: 1 }]
        };

        const first = await runWithTransaction(sequelize, () => useCase({ posTransactionId: 901, payload, user: { user_id: 12 } }));
        const replay = await runWithTransaction(sequelize, () => useCase({ posTransactionId: 901, payload, user: { user_id: 12 } }));
        const conflict = await runWithTransaction(sequelize, () => useCase({
            posTransactionId: 901,
            payload: { ...payload, reason: 'Different reason' },
            user: { user_id: 12 }
        }));

        expect(first.success).toBe(true);
        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(conflict.success).toBe(false);
        expect(conflict.error.details.reason_code).toBe('POS_RETURN_IDEMPOTENCY_CONFLICT');
        expect(repository.createPosTransactionAdjustment).toHaveBeenCalledTimes(1);
        expect(getStoredAdjustment()).toEqual(expect.objectContaining({ adjustment_type: 'return' }));
    });

    it('rejects a return quantity greater than the original issued quantity', async () => {
        const { sequelize } = buildTransactionContext();
        const { repository } = buildRepository();
        const useCase = buildReturnPosTransactionUseCase({ posRepository: repository });

        const result = await runWithTransaction(sequelize, () => useCase({
            posTransactionId: 901,
            payload: {
                idempotency_key: 'return-request-003',
                shift_id: 801,
                terminal_id: 'TERM-01',
                terminal_location_id: 3,
                reason: 'Too many units',
                returned_lines: [{ line_id: 1, quantity: 3 }]
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('POS_RETURN_QUANTITY_EXCEEDS_ORIGINAL');
        expect(repository.createPosTransactionAdjustment).not.toHaveBeenCalled();
        expect(repository.createFiscalEvent).not.toHaveBeenCalled();
    });
});
