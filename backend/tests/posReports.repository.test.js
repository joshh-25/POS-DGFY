import { jest } from '@jest/globals';
import { Op } from 'sequelize';

const mockFindAll = jest.fn();

const PosTransactionModel = { modelName: 'PosTransaction', findAll: mockFindAll };
const PosTransactionLineModel = { modelName: 'PosTransactionLine' };
const ItemModel = { modelName: 'Item' };
const UserModel = { modelName: 'User' };
const PosTerminalShiftModel = { modelName: 'PosTerminalShift' };

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((name) => {
            switch (name) {
                case 'PosTransaction':
                    return PosTransactionModel;
                case 'PosTransactionLine':
                    return PosTransactionLineModel;
                case 'Item':
                    return ItemModel;
                case 'User':
                    return UserModel;
                case 'PosTerminalShift':
                    return PosTerminalShiftModel;
                default:
                    return null;
            }
        }),
        getStore: jest.fn(() => null)
    }
}));

let posRepository;

beforeAll(async () => {
    ({ posRepository } = await import('../src/modules/pos/repositories/posRepository.js'));
});

describe('posRepository reports analytics', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('computes POS profit/loss using cost snapshot first and IMS fallback second', async () => {
        mockFindAll.mockResolvedValue([
            {
                pos_transaction_id: 101,
                created_at: '2026-06-22T08:00:00.000Z',
                status: 'completed',
                payment_status: 'paid',
                subtotal_amount: 100,
                discount_amount: 10,
                service_fee_amount: 5,
                restaurant_service_charge_amount: 0,
                vat_amount: 12,
                payment_type: 'cash',
                order_source: 'in_store',
                order_method: 'dine_in',
                cashier_id: 9,
                cashier: { user_id: 9, username: 'cashier-1' },
                discount: { discount_type: 'senior', discount_amount: 10, vat_removed: 2 },
                discount_label_snapshot: 'Senior Citizen',
                shift: {
                    pos_terminal_shift_id: 3,
                    business_date: '2026-06-22',
                    terminal_id: 'POS-01',
                    location_id: 12,
                    status: 'closed',
                    opening_float_amount: 500,
                    expected_cash_amount: 590,
                    closing_cash_amount: 585,
                    cash_variance_amount: -5
                },
                lines: [{
                    item_id: 1,
                    quantity: 2,
                    cost_snapshot: 30,
                    line_subtotal: 100,
                    item: {
                        item_id: 1,
                        name: 'Chicken',
                        sku_code: 'DGFTY-ITEM-000001',
                        category: 'product',
                        cost_per_unit: 40
                    }
                }]
            },
            {
                pos_transaction_id: 102,
                created_at: '2026-06-22T09:00:00.000Z',
                status: 'completed',
                payment_status: 'paid',
                subtotal_amount: 50,
                discount_amount: 0,
                service_fee_amount: 0,
                restaurant_service_charge_amount: 0,
                vat_amount: 6,
                payment_type: 'gcash',
                order_source: 'online_store',
                fulfillment_status: 'completed',
                order_method: 'online',
                cashier_id: 9,
                cashier: { user_id: 9, username: 'cashier-1' },
                shift: { pos_terminal_shift_id: 3, business_date: '2026-06-22', terminal_id: 'POS-01', location_id: 12 },
                lines: [{
                    item_id: 2,
                    quantity: 1,
                    cost_snapshot: null,
                    line_subtotal: 50,
                    item: {
                        item_id: 2,
                        name: 'Burger',
                        sku_code: 'DGFTY-ITEM-000002',
                        category: 'product',
                        cost_per_unit: 20
                    }
                }]
            }
        ]);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-06-22',
            date_to: '2026-06-22',
            location_id: 12
        });

        expect(result.summary_cards).toEqual({
            total_sales: 140,
            total_transactions: 2,
            gross_sales: 150,
            net_sales: 140,
            pos_profit_loss: 60
        });
        expect(result.daily_report.summary).toEqual(expect.objectContaining({
            gross_sales: 150,
            net_sales: 140,
            cogs: 80,
            pos_profit_loss: 60,
            discounts: 10,
            vat: 18,
            service_fees: 5,
            total_transactions: 2
        }));
        expect(result.daily_report.order_method_breakdown).toEqual(expect.arrayContaining([
            expect.objectContaining({
                order_method: 'dine_in',
                total_transactions: 1,
                net_sales: 90
            }),
            expect.objectContaining({
                order_method: 'online',
                total_transactions: 1,
                net_sales: 50
            })
        ]));
        expect(result.daily_report.top_items[0]).toEqual(expect.objectContaining({
            item_name: 'Chicken',
            quantity: 2,
            cogs: 60,
            pos_profit_loss: 30
        }));
        expect(result.daily_report.top_items[1]).toEqual(expect.objectContaining({
            item_name: 'Burger',
            quantity: 1,
            cogs: 20,
            pos_profit_loss: 30
        }));
    });

    it('normalizes refunded sales as refunds/voids deductions and applies category filter', async () => {
        mockFindAll.mockResolvedValue([
            {
                pos_transaction_id: 201,
                created_at: '2026-06-22T10:00:00.000Z',
                status: 'completed',
                payment_status: 'refunded',
                subtotal_amount: 90,
                discount_amount: 0,
                service_fee_amount: 0,
                restaurant_service_charge_amount: 0,
                vat_amount: 10.8,
                payment_type: 'card',
                order_source: 'in_store',
                order_method: 'dine_in',
                cashier_id: 10,
                cashier: { user_id: 10, username: 'cashier-2' },
                shift: { pos_terminal_shift_id: 4, business_date: '2026-06-22', terminal_id: 'POS-02', location_id: 15 },
                lines: [
                    {
                        item_id: 11,
                        quantity: 1,
                        cost_snapshot: 30,
                        line_subtotal: 90,
                        item: {
                            item_id: 11,
                            name: 'Steak',
                            sku_code: 'DGFTY-ITEM-000011',
                            category: 'product',
                            cost_per_unit: 35
                        }
                    },
                    {
                        item_id: 12,
                        quantity: 1,
                        cost_snapshot: 5,
                        line_subtotal: 20,
                        item: {
                            item_id: 12,
                            name: 'Paper Bag',
                            sku_code: 'DGFTY-ITEM-000012',
                            category: 'supplies',
                            cost_per_unit: 5
                        }
                    }
                ]
            }
        ]);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-06-22',
            date_to: '2026-06-22',
            location_id: 15,
            category: 'product'
        });

        expect(result.daily_report.summary).toEqual(expect.objectContaining({
            gross_sales: 90,
            net_sales: 0,
            refunds_voids: 90,
            cogs: 30,
            pos_profit_loss: -30,
            profit_margin: 0,
            is_loss: true
        }));
        expect(result.daily_report.top_items).toHaveLength(1);
        expect(result.daily_report.top_items[0]).toEqual(expect.objectContaining({
            item_name: 'Steak',
            category: 'product'
        }));
    });

    it('includes voided transactions in refunds/voids and gross sales', async () => {
        mockFindAll.mockResolvedValue([
            {
                pos_transaction_id: 301,
                created_at: '2026-06-22T11:00:00.000Z',
                status: 'voided',
                payment_status: 'paid',
                subtotal_amount: 60,
                discount_amount: 0,
                service_fee_amount: 0,
                restaurant_service_charge_amount: 0,
                vat_amount: 7.2,
                payment_type: 'cash',
                order_source: 'in_store',
                order_method: 'dine_in',
                cashier_id: 9,
                cashier: { user_id: 9, username: 'cashier-1' },
                shift: { pos_terminal_shift_id: 3, business_date: '2026-06-22', terminal_id: 'POS-01', location_id: 12 },
                lines: [{
                    item_id: 3,
                    quantity: 1,
                    cost_snapshot: 20,
                    line_subtotal: 60,
                    item: {
                        item_id: 3,
                        name: 'Fries',
                        sku_code: 'DGFTY-ITEM-000003',
                        category: 'product',
                        cost_per_unit: 20
                    }
                }]
            }
        ]);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-06-22',
            date_to: '2026-06-22',
            location_id: 12
        });

        expect(result.daily_report.summary).toEqual(expect.objectContaining({
            gross_sales: 60,
            net_sales: 0,
            refunds_voids: 60,
            cogs: 20,
            pos_profit_loss: -20,
            is_loss: true
        }));
    });

    it('excludes transactions dated the day after date_to (off-by-one boundary regression)', async () => {
        mockFindAll.mockResolvedValue([]);

        await posRepository.getReportsOverview({
            date_from: '2026-06-22',
            date_to: '2026-06-22',
            location_id: 12
        });

        const where = mockFindAll.mock.calls[0][0].where;
        const startAt = where.created_at[Op.gte];
        const endAtExclusive = where.created_at[Op.lt];

        // Single-day range must span exactly 24 hours: date_to 00:00:00+08:00
        // through date_to+1 00:00:00+08:00 (exclusive) -- not an extra day.
        expect(endAtExclusive.getTime() - startAt.getTime()).toBe(24 * 60 * 60 * 1000);
        expect(endAtExclusive.toISOString()).toBe('2026-06-22T16:00:00.000Z');
    });
    it('builds financially recognized source filters for POS reports', async () => {
        mockFindAll.mockResolvedValue([]);

        await posRepository.getReportsOverview({
            date_from: '2026-06-01',
            date_to: '2026-06-22',
            location_id: 9,
            source: 'pickup',
            payment_type: 'cash',
            terminal_id: 'POS-01'
        });

        const where = mockFindAll.mock.calls[0][0].where;
        expect(where.status).toEqual({ [Op.in]: ['completed', 'voided'] });
        expect(where.location_id).toBe(9);
        expect(where.terminal_id).toBe('POS-01');
        expect(where.payment_type).toBe('cash');
        expect(where[Op.or]).toEqual(expect.arrayContaining([
            { order_source: 'in_store' },
            { order_source: null },
            { order_source: 'online_store', fulfillment_status: 'completed' }
        ]));
        expect(where[Op.and]).toEqual(expect.arrayContaining([
            { order_method: 'pickup' }
        ]));
    });
});
