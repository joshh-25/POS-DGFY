import { jest } from '@jest/globals';

const findPosTransactions = jest.fn();

const modelMap = {
    PosTransaction: { findAll: findPosTransactions },
    PosTransactionLine: { modelName: 'PosTransactionLine' },
    PosTransactionDiscount: { modelName: 'PosTransactionDiscount' },
    PosTransactionDiscountLine: { modelName: 'PosTransactionDiscountLine' },
    DispatchOrder: { findAll: jest.fn().mockResolvedValue([]) },
    DispatchOrderLine: { modelName: 'DispatchOrderLine' },
    Item: { modelName: 'Item' },
    User: { modelName: 'User' }
};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: { get: jest.fn((name) => modelMap[name] ?? null) }
}));

let salesRepository;

beforeAll(async () => {
    ({ salesRepository } = await import('../src/modules/sales/repositories/salesRepository.js'));
});

test('unified POS sales read model exposes saved promo and fulfillment truth', async () => {
    findPosTransactions.mockResolvedValue([{
        pos_transaction_id: 77,
        invoice_number: 'INV-77',
        created_at: '2026-07-10T04:00:00.000Z',
        status: 'completed',
        order_source: 'online_store',
        order_method: 'delivery',
        fulfillment_status: 'completed',
        payment_type: 'qrph',
        payment_status: 'paid',
        customer_name: 'Buyer',
        subtotal_amount: 100,
        discount_amount: 20,
        discount_label_snapshot: 'Online Promo',
        discount_rate_snapshot: 20,
        service_fee_amount: 1,
        delivery_fee: 30,
        total_amount: 111,
        discount: { discount_type: 'promo', promo_code: 'SAVE20', lines: [] },
        lines: [{ quantity: 1, cost_snapshot: 40, item_id: 10, line_subtotal: 100, item: { name: 'Meal' } }]
    }]);

    const result = await salesRepository.listUnifiedTransactions({
        filters: { source: 'POS' },
        userPermissions: ['pos:view']
    });

    expect(result.transactions[0]).toEqual(expect.objectContaining({
        customer_or_recipient: 'Buyer',
        payment_status: 'paid',
        fulfillment_status: 'completed',
        subtotal_amount: 100,
        delivery_fee: 30,
        discount_type: 'promo',
        promo_code: 'SAVE20',
        discount_amount: 20,
        gross_sales: 111
    }));
});
