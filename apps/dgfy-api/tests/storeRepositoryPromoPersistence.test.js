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
});
