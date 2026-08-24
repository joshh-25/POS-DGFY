import { jest } from '@jest/globals';

const createTransaction = jest.fn();
const createLines = jest.fn();
const findLines = jest.fn();
const createDiscount = jest.fn();
const createDiscountLines = jest.fn();

const models = {
    PosTransaction: { create: createTransaction },
    PosTransactionLine: { bulkCreate: createLines, findAll: findLines },
    PosTransactionDiscount: { create: createDiscount },
    PosTransactionDiscountLine: { bulkCreate: createDiscountLines },
    DeliveryJob: null
};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((name) => models[name] ?? null)
    }
}));

let storeRepository;

beforeAll(async () => {
    ({ storeRepository } = await import('../src/modules/store/repositories/storeRepository.js'));
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('storeRepository promo persistence', () => {
    test('writes promo identity and allocations in the order transaction', async () => {
        const transaction = { id: 'tenant-checkout-transaction' };
        createTransaction.mockResolvedValue({ pos_transaction_id: 91 });
        findLines.mockResolvedValue([
            { line_id: 501, item_id: 10, line_subtotal: 100 },
            { line_id: 502, item_id: 20, line_subtotal: 50 }
        ]);
        createDiscount.mockResolvedValue({ id: 801 });

        const result = await storeRepository.createOnlineTransactionWithLines({
            header: { invoice_number: 'INV-91', order_method: 'pickup' },
            lines: [
                { item_id: 10, quantity: 1, line_subtotal: 100 },
                { item_id: 20, quantity: 1, line_subtotal: 50 }
            ],
            discount: {
                promo_code: 'SAVE20',
                discount_rate: 20,
                discount_amount: 20,
                lines: [
                    { eligible_quantity: 1, gross_eligible_amount: 100, discount_amount: 20, final_line_amount: 80 },
                    { eligible_quantity: 0, gross_eligible_amount: 0, discount_amount: 0, final_line_amount: 50 }
                ]
            }
        }, { transaction });

        expect(result).toBe(91);
        expect(createDiscount).toHaveBeenCalledWith(expect.objectContaining({
            transaction_id: 91,
            discount_type: 'promo',
            discount_method: 'percentage',
            discount_rate: 20,
            discount_amount: 20,
            promo_code: 'SAVE20',
            calculation_version: 'pos-discount.v2'
        }), { transaction });
        expect(createDiscountLines).toHaveBeenCalledWith([
            expect.objectContaining({ transaction_discount_id: 801, transaction_line_id: 501, item_id: 10, discount_amount: 20, final_line_amount: 80 }),
            expect.objectContaining({ transaction_discount_id: 801, transaction_line_id: 502, item_id: 20, discount_amount: 0, final_line_amount: 50 })
        ], { transaction });
    });

    // #667 Phase 110: a voucher redemption now writes the same audit row shape a promo redemption
    // already did, sourced from the caller-supplied `discount_type`/`discount_method` instead of
    // the hardcoded 'promo'/'percentage' literals exercised above.
    test('writes voucher identity and allocations, with a caller-supplied discount_type/method', async () => {
        const transaction = { id: 'tenant-checkout-transaction' };
        createTransaction.mockResolvedValue({ pos_transaction_id: 92 });
        findLines.mockResolvedValue([
            { line_id: 601, item_id: 30, line_subtotal: 200 }
        ]);
        createDiscount.mockResolvedValue({ id: 802 });

        const result = await storeRepository.createOnlineTransactionWithLines({
            header: { invoice_number: 'INV-92', order_method: 'pickup' },
            lines: [{ item_id: 30, quantity: 2, line_subtotal: 200 }],
            discount: {
                discount_type: 'voucher',
                discount_method: 'fixed',
                discount_rate: null,
                discount_amount: 30,
                promo_code: 'PHARMA8',
                lines: [
                    { eligible_quantity: 2, gross_eligible_amount: 200, discount_amount: 30, final_line_amount: 170 }
                ]
            }
        }, { transaction });

        expect(result).toBe(92);
        expect(createDiscount).toHaveBeenCalledWith(expect.objectContaining({
            transaction_id: 92,
            discount_type: 'voucher',
            discount_method: 'fixed',
            discount_rate: null,
            discount_amount: 30,
            promo_code: 'PHARMA8'
        }), { transaction });
        expect(createDiscountLines).toHaveBeenCalledWith([
            expect.objectContaining({ transaction_discount_id: 802, transaction_line_id: 601, item_id: 30, discount_amount: 30, final_line_amount: 170 })
        ], { transaction });
    });

    // The case an item_id-keyed allocation map would silently collapse: two transaction lines
    // sharing one item_id (the F&B modifier shape), each needing its own independent allocation.
    // Alignment is positional here (allocations[index] against transactionLines fetched in
    // line_id order), so this passes as long as the caller preserves line order -- exactly what
    // voucherRedemptionUseCases.js's now-unfiltered `lineAllocations` guarantees.
    test('aligns allocations positionally, not by item_id, for two lines sharing one item_id', async () => {
        const transaction = { id: 'tenant-checkout-transaction' };
        createTransaction.mockResolvedValue({ pos_transaction_id: 93 });
        findLines.mockResolvedValue([
            { line_id: 701, item_id: 40, line_subtotal: 100 },
            { line_id: 702, item_id: 40, line_subtotal: 100 }
        ]);
        createDiscount.mockResolvedValue({ id: 803 });

        await storeRepository.createOnlineTransactionWithLines({
            header: { invoice_number: 'INV-93', order_method: 'pickup' },
            lines: [
                { item_id: 40, quantity: 1, line_subtotal: 100 },
                { item_id: 40, quantity: 1, line_subtotal: 100 }
            ],
            discount: {
                discount_type: 'voucher',
                discount_method: 'percentage',
                discount_rate: 10,
                discount_amount: 10,
                promo_code: 'DUPITEM',
                // Only the FIRST of the two same-item_id lines is discounted -- an item_id-keyed
                // map would apply this to both (or overwrite/collapse), a positional map applies
                // it to only line_id 701.
                lines: [
                    { eligible_quantity: 1, gross_eligible_amount: 100, discount_amount: 10, final_line_amount: 90 },
                    { eligible_quantity: 0, gross_eligible_amount: 0, discount_amount: 0, final_line_amount: 100 }
                ]
            }
        }, { transaction });

        expect(createDiscountLines).toHaveBeenCalledWith([
            expect.objectContaining({ transaction_discount_id: 803, transaction_line_id: 701, item_id: 40, discount_amount: 10, final_line_amount: 90 }),
            expect.objectContaining({ transaction_discount_id: 803, transaction_line_id: 702, item_id: 40, discount_amount: 0, final_line_amount: 100 })
        ], { transaction });
    });
});
