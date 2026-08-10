import { buildSettleServiceBookingUseCase } from '../src/modules/services/usecases/serviceUseCases.js';
import { jest } from '@jest/globals';

const transaction = () => ({
    finished: false,
    commit: jest.fn(async function commit() {
        this.finished = 'commit';
    }),
    rollback: jest.fn(async function rollback() {
        this.finished = 'rollback';
    })
});

const baseBooking = (overrides = {}) => ({
    booking_id: 1,
    public_reference: 'SVC-000001',
    status: 'completed',
    quantity: 1,
    service_item_id: 10,
    location_id: 3,
    customer_name: 'Guest',
    customer_email: 'guest@example.com',
    customer_phone: null,
    pos_transaction_id: null,
    serviceItem: { item_id: 10, name: 'Consultation', default_sale_price: 750, vat_type: 'vatable' },
    lines: [{
        booking_line_id: 501,
        line_type: 'service',
        item_id: 10,
        name_snapshot: 'Consultation',
        quantity: 1,
        unit_price: 750,
        line_amount: 750,
        vat_type_snapshot: 'vatable',
        stock_effect_type: 'stock_exempt',
        stock_exempt_reason: 'service_item'
    }],
    ...overrides
});

describe('buildSettleServiceBookingUseCase', () => {
    it('settles a booking into a linked, newly created pos_transaction', async () => {
        const tx = transaction();
        const createSettlementTransaction = jest.fn(async () => ({
            transactionId: 900,
            lines: [{ line_id: 5000 }]
        }));
        const updateBookingById = jest.fn(async () => baseBooking({ pos_transaction_id: 900, payment_status: 'paid' }));
        const getBookingById = jest.fn()
            .mockResolvedValueOnce(baseBooking())
            .mockResolvedValueOnce(baseBooking({ pos_transaction_id: 900, payment_status: 'paid' }));
        const getPosTransactionSnapshotById = jest.fn(async () => ({
            pos_transaction_id: 900,
            invoice_number: 'SVC-000001',
            document_type: 'non_fiscal_slip',
            document_context: 'non_fiscal',
            payment_type: 'cash',
            payment_status: 'paid',
            total_amount: 750
        }));

        const useCase = buildSettleServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getBookingById,
                nextSettlementInvoiceNumber: jest.fn(async () => 'SVC-000001'),
                createSettlementTransaction,
                updateBookingLineById: jest.fn(),
                updateBookingById,
                getPosTransactionSnapshotById
            },
            inventoryCommandService: { issueStockForPosSale: jest.fn() }
        });

        const result = await useCase({ bookingId: 1, payload: {}, user: { user_id: 7 } });

        expect(result.success).toBe(true);
        expect(result.data.idempotency.idempotent_replay).toBe(false);
        expect(result.data.pos_transaction.pos_transaction_id).toBe(900);
        expect(result.data.booking.pos_transaction_id).toBe(900);
        expect(createSettlementTransaction).toHaveBeenCalledTimes(1);
        const [{ header, lines }] = createSettlementTransaction.mock.calls[0];
        expect(header.total_amount).toBe(750);
        expect(header.order_method).toBe('appointment');
        expect(header.payment_status).toBe('paid');
        expect(lines).toHaveLength(1);
        expect(lines[0].stock_effect_type).toBe('stock_exempt');
        expect(updateBookingById).toHaveBeenCalledWith(1, expect.objectContaining({
            pos_transaction_id: 900,
            payment_status: 'paid',
            status: 'completed'
        }), expect.anything());
        expect(tx.commit).toHaveBeenCalled();
    });

    it('is idempotent -- settling an already-settled booking replays the existing transaction instead of creating a new one', async () => {
        const tx = transaction();
        const createSettlementTransaction = jest.fn();
        const getPosTransactionSnapshotById = jest.fn(async () => ({
            pos_transaction_id: 900,
            invoice_number: 'SVC-000001',
            total_amount: 750,
            payment_status: 'paid'
        }));

        const useCase = buildSettleServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getBookingById: jest.fn(async () => baseBooking({ pos_transaction_id: 900 })),
                createSettlementTransaction,
                getPosTransactionSnapshotById
            },
            inventoryCommandService: { issueStockForPosSale: jest.fn() }
        });

        const result = await useCase({ bookingId: 1, payload: {}, user: { user_id: 7 } });

        expect(result.success).toBe(true);
        expect(result.data.idempotency.idempotent_replay).toBe(true);
        expect(result.data.pos_transaction.pos_transaction_id).toBe(900);
        expect(createSettlementTransaction).not.toHaveBeenCalled();
        expect(tx.commit).toHaveBeenCalled();
    });

    it('computes the settlement amount from the booking_lines price snapshot, not the item current live price', async () => {
        const tx = transaction();
        const createSettlementTransaction = jest.fn(async () => ({ transactionId: 900, lines: [{ line_id: 1 }] }));

        const useCase = buildSettleServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                // The item's live price has since changed to 999, but the booking's
                // own price snapshot (750, taken at booking time) is what must settle.
                getBookingById: jest.fn(async () => baseBooking({
                    serviceItem: { item_id: 10, name: 'Consultation', default_sale_price: 999, vat_type: 'vatable' }
                })),
                nextSettlementInvoiceNumber: jest.fn(async () => 'SVC-000001'),
                createSettlementTransaction,
                updateBookingLineById: jest.fn(),
                updateBookingById: jest.fn(async () => baseBooking({ pos_transaction_id: 900 })),
                getPosTransactionSnapshotById: jest.fn(async () => ({ pos_transaction_id: 900, total_amount: 750 }))
            },
            inventoryCommandService: { issueStockForPosSale: jest.fn() }
        });

        const result = await useCase({ bookingId: 1, payload: {}, user: { user_id: 7 } });

        expect(result.success).toBe(true);
        const [{ header }] = createSettlementTransaction.mock.calls[0];
        expect(header.total_amount).toBe(750);
    });

    it('deducts stock for a part line while the labor line stays stock-exempt on the same transaction', async () => {
        const tx = transaction();
        const createSettlementTransaction = jest.fn(async () => ({
            transactionId: 900,
            lines: [{ line_id: 1 }, { line_id: 2 }]
        }));
        const issueStockForPosSale = jest.fn(async () => ({ movement_id: 4321 }));
        const updateBookingLineById = jest.fn();
        const createBookingLines = jest.fn(async (rows) => rows.map((row, index) => ({ ...row, booking_line_id: 900 + index })));

        const useCase = buildSettleServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getBookingById: jest.fn(async () => baseBooking()),
                findItemById: jest.fn(async () => ({
                    item_id: 55,
                    name: 'Replacement Screen',
                    category: 'product',
                    default_sale_price: 500,
                    vat_type: 'vatable'
                })),
                createBookingLines,
                nextSettlementInvoiceNumber: jest.fn(async () => 'SVC-000001'),
                createSettlementTransaction,
                updateBookingLineById,
                updateBookingById: jest.fn(async () => baseBooking({ pos_transaction_id: 900 })),
                getPosTransactionSnapshotById: jest.fn(async () => ({ pos_transaction_id: 900, total_amount: 1250 }))
            },
            inventoryCommandService: { issueStockForPosSale }
        });

        const result = await useCase({
            bookingId: 1,
            payload: { parts: [{ item_id: 55, quantity: 2 }] },
            user: { user_id: 7 }
        });

        expect(result.success).toBe(true);
        expect(createBookingLines).toHaveBeenCalledWith([
            expect.objectContaining({ line_type: 'part', item_id: 55, quantity: 2, stock_effect_type: 'inventory_issue' })
        ], expect.anything());

        const [{ lines }] = createSettlementTransaction.mock.calls[0];
        expect(lines).toHaveLength(2);
        const laborLine = lines.find((line) => line.item_id === 10);
        const partLine = lines.find((line) => line.item_id === 55);
        expect(laborLine.stock_effect_type).toBe('stock_exempt');
        expect(partLine.stock_effect_type).toBe('inventory_issue');
        expect(partLine.sale_price).toBe(500);
        expect(partLine.line_subtotal).toBe(1000);

        expect(issueStockForPosSale).toHaveBeenCalledTimes(1);
        const [movementData] = issueStockForPosSale.mock.calls[0];
        expect(movementData).toEqual(expect.objectContaining({ item_id: 55, quantity: 2, movement_type: 'goods_issue' }));
        expect(updateBookingLineById).toHaveBeenCalledWith(900, expect.objectContaining({ stock_movement_id: 4321 }), expect.anything());
    });

    it('rejects settling a cancelled booking', async () => {
        const tx = transaction();
        const useCase = buildSettleServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getBookingById: jest.fn(async () => baseBooking({ status: 'cancelled' }))
            },
            inventoryCommandService: {}
        });

        const result = await useCase({ bookingId: 1, payload: {}, user: { user_id: 7 } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('rejects a part line missing a positive item_id or quantity', async () => {
        const tx = transaction();
        const useCase = buildSettleServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getBookingById: jest.fn(async () => baseBooking())
            },
            inventoryCommandService: {}
        });

        const result = await useCase({
            bookingId: 1,
            payload: { parts: [{ item_id: 0, quantity: -1 }] },
            user: { user_id: 7 }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(tx.rollback).toHaveBeenCalled();
    });
});
