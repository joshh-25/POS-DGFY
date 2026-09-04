import { jest } from '@jest/globals';
import { Op } from 'sequelize';

const mockFindAll = jest.fn();
const mockLineFindAll = jest.fn();
const mockItemFolderFindAll = jest.fn();
const mockShiftFindAll = jest.fn();
const mockAdjustmentFindAll = jest.fn();
const mockAttendanceFindAll = jest.fn();
const mockOperatorFindAll = jest.fn();
const mockHandoffFindAll = jest.fn();
const mockSequelize = {
    fn: jest.fn((...args) => ({ fn: args })),
    col: jest.fn((name) => ({ col: name }))
};

const PosTransactionModel = { modelName: 'PosTransaction', findAll: mockFindAll };
const PosTransactionLineModel = { modelName: 'PosTransactionLine', findAll: mockLineFindAll };
const ItemModel = { modelName: 'Item' };
const ItemFolderModel = { modelName: 'ItemFolder', findAll: mockItemFolderFindAll };
const UserModel = { modelName: 'User' };
const PosTerminalShiftModel = { modelName: 'PosTerminalShift', findAll: mockShiftFindAll };
const PosCashDrawerEventModel = { modelName: 'PosCashDrawerEvent' };
const PosTransactionDiscountModel = { modelName: 'PosTransactionDiscount' };
const PosTransactionDiscountLineModel = { modelName: 'PosTransactionDiscountLine' };
const PosTransactionAdjustmentModel = { modelName: 'PosTransactionAdjustment', findAll: mockAdjustmentFindAll };
const EmployeeAttendanceSessionModel = { modelName: 'EmployeeAttendanceSession', findAll: mockAttendanceFindAll };
const EmployeeBreakSegmentModel = { modelName: 'EmployeeBreakSegment' };
const PosTerminalOperatorSessionModel = { modelName: 'PosTerminalOperatorSession', findAll: mockOperatorFindAll };
const PosDrawerHandoffEventModel = { modelName: 'PosDrawerHandoffEvent', findAll: mockHandoffFindAll };

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
                case 'ItemFolder':
                    return ItemFolderModel;
                case 'User':
                    return UserModel;
                case 'PosTerminalShift':
                    return PosTerminalShiftModel;
                case 'PosCashDrawerEvent':
                    return PosCashDrawerEventModel;
                case 'sequelize':
                    return mockSequelize;
                case 'PosTransactionDiscount':
                    return PosTransactionDiscountModel;
                case 'PosTransactionDiscountLine':
                    return PosTransactionDiscountLineModel;
                case 'PosTransactionAdjustment':
                    return PosTransactionAdjustmentModel;
                case 'EmployeeAttendanceSession':
                    return EmployeeAttendanceSessionModel;
                case 'EmployeeBreakSegment':
                    return EmployeeBreakSegmentModel;
                case 'PosTerminalOperatorSession':
                    return PosTerminalOperatorSessionModel;
                case 'PosDrawerHandoffEvent':
                    return PosDrawerHandoffEventModel;
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
        mockItemFolderFindAll.mockResolvedValue([]);
        mockShiftFindAll.mockResolvedValue([]);
        mockLineFindAll.mockResolvedValue([{ post_close_voided_item_count: 0 }]);
        mockAdjustmentFindAll.mockResolvedValue([]);
        mockAttendanceFindAll.mockResolvedValue([]);
        mockOperatorFindAll.mockResolvedValue([]);
        mockHandoffFindAll.mockResolvedValue([]);
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
                discount: {
                    discount_type: 'promo',
                    discount_amount: 10,
                    vat_removed: 0,
                    promo_code: 'SAVE10',
                    lines: [{ transaction_line_id: 501, discount_amount: 10, vat_removed: 0 }]
                },
                discount_label_snapshot: 'Summer Promo',
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
                    line_id: 501,
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
        expect(result.daily_report.discount_breakdown).toEqual([
            expect.objectContaining({
                discount_label: 'Summer Promo (SAVE10)',
                discount_type: 'promo',
                promo_code: 'SAVE10',
                transaction_count: 1,
                discount_amount: 10
            })
        ]);
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

    it('returns cashier transaction rows with shift cash reconciliation for the selected date and cashier', async () => {
        mockFindAll.mockResolvedValue([
            {
                pos_transaction_id: 401,
                invoice_number: 'INV-401',
                created_at: '2026-06-22T08:00:00.000Z',
                status: 'completed',
                payment_status: 'paid',
                subtotal_amount: 100,
                discount_amount: 10,
                service_fee_amount: 0,
                restaurant_service_charge_amount: 0,
                vat_amount: 0,
                total_amount: 90,
                payment_type: 'cash',
                payment_breakdown: [{ payment_type: 'cash', count: 1, amount: 90 }],
                order_source: 'in_store',
                order_method: 'dine_in',
                cashier_id: 9,
                cashier: { user_id: 9, username: 'cashier-1' },
                shift: {
                    pos_terminal_shift_id: 31,
                    business_date: '2026-06-22',
                    terminal_id: 'POS-01',
                    location_id: 12
                },
                lines: [{
                    line_id: 401,
                    item_id: 1,
                    quantity: 1,
                    cost_snapshot: 20,
                    line_subtotal: 100,
                    item: {
                        item_id: 1,
                        name: 'Chicken',
                        sku_code: 'DGFTY-ITEM-000001',
                        category: 'product',
                        cost_per_unit: 20
                    }
                }]
            }
        ]);
        mockShiftFindAll.mockResolvedValue([
            {
                pos_terminal_shift_id: 31,
                business_date: '2026-06-22',
                terminal_id: 'POS-01',
                location_id: 12,
                cashier_id: 9,
                status: 'closed',
                opening_float_amount: 500,
                expected_cash_amount: 595,
                closing_cash_amount: 590,
                cash_variance_amount: -5,
                cashier: { user_id: 9, username: 'cashier-1' },
                cashEvents: [
                    { event_type: 'cash_in', amount: 10 },
                    { event_type: 'cash_out', amount: 5 }
                ]
            }
        ]);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-06-22',
            date_to: '2026-06-22',
            location_id: 12,
            cashier_id: 9
        });

        expect(result.daily_report.cashier_summary).toEqual([
            expect.objectContaining({
                cashier_id: 9,
                cashier_name: 'cashier-1',
                shift_money: expect.objectContaining({
                    shift_count: 1,
                    closed_shift_count: 1,
                    opening_float_amount: 500,
                    cash_sales_amount: 90,
                    cash_in_total: 10,
                    cash_out_total: 5,
                    expected_cash_amount: 595,
                    closing_cash_amount: 590,
                    cash_variance_amount: -5
                })
            })
        ]);
        expect(result.daily_report.transaction_rows).toEqual([
            expect.objectContaining({
                invoice_number: 'INV-401',
                cashier_name: 'cashier-1',
                payment_type: 'cash',
                total_amount: 90,
                net_sales: 90
            })
        ]);

        expect(mockShiftFindAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                cashier_id: 9,
                location_id: 12,
                business_date: expect.objectContaining({
                    [Op.gte]: '2026-06-22',
                    [Op.lte]: '2026-06-22'
                })
            })
        }));
    });

    it('keeps attendance, actual operators, shared access, and register variance independently reconcilable', async () => {
        mockFindAll.mockResolvedValue([{
            pos_transaction_id: 451,
            invoice_number: 'INV-451',
            operator_session_id: 701,
            created_at: '2026-08-24T04:30:00.000Z',
            status: 'completed',
            payment_status: 'paid',
            subtotal_amount: 100,
            discount_amount: 0,
            service_fee_amount: 0,
            restaurant_service_charge_amount: 0,
            vat_amount: 0,
            total_amount: 100,
            payment_type: 'cash',
            payment_breakdown: [{ payment_type: 'cash', amount: 100 }],
            order_source: 'in_store',
            order_method: 'dine_in',
            cashier_id: 22,
            cashier: { user_id: 22, username: 'Cashier B' },
            shift_id: 81,
            shift: { pos_terminal_shift_id: 81, business_date: '2026-08-24', terminal_id: 'POS-01', location_id: 12 },
            lines: [{ line_id: 991, item_id: 1, quantity: 1, cost_snapshot: 20, line_subtotal: 100, item: { item_id: 1, name: 'Meal', sku_code: 'MEAL-1', category: 'product', cost_per_unit: 20 } }]
        }]);
        mockShiftFindAll.mockResolvedValue([{
            pos_terminal_shift_id: 81,
            business_date: '2026-08-24',
            terminal_id: 'POS-01',
            location_id: 12,
            cashier_id: 11,
            status: 'closed',
            opening_float_amount: 500,
            expected_cash_amount: 600,
            closing_cash_amount: 595,
            cash_variance_amount: -5,
            cashier: { user_id: 11, username: 'Cashier A' },
            cashEvents: []
        }]);
        mockAttendanceFindAll.mockResolvedValue([{
            employee_attendance_session_id: 301,
            user_id: 11,
            location_id: 12,
            duty_type: 'regular',
            status: 'closed',
            started_at: '2026-08-23T23:00:00.000Z',
            ended_at: '2026-08-24T07:00:00.000Z',
            user: { user_id: 11, username: 'Cashier A' },
            breakSegments: [{ employee_break_segment_id: 401, status: 'closed', started_at: '2026-08-24T04:00:00.000Z', ended_at: '2026-08-24T05:00:00.000Z' }]
        }]);
        mockOperatorFindAll.mockResolvedValue([{
            pos_terminal_operator_session_id: 701,
            pos_terminal_shift_id: 81,
            terminal_id: 'POS-01',
            location_id: 12,
            user_id: 22,
            status: 'ended',
            started_at: '2026-08-24T04:00:00.000Z',
            ended_at: '2026-08-24T05:00:00.000Z',
            ended_reason: 'relief_complete',
            operator: { user_id: 22, username: 'Cashier B' }
        }]);
        mockHandoffFindAll.mockResolvedValue([{
            pos_drawer_handoff_event_id: 901,
            pos_terminal_shift_id: 81,
            terminal_id: 'POS-01',
            location_id: 12,
            event_type: 'shared_relief_start',
            custody_mode: 'shared_access',
            outgoing_operator_user_id: 11,
            incoming_operator_user_id: 22,
            outgoingOperator: { user_id: 11, username: 'Cashier A' },
            incomingOperator: { user_id: 22, username: 'Cashier B' },
            expected_cash_amount: null,
            counted_cash_amount: null,
            variance_amount: null,
            event_at: '2026-08-24T04:00:00.000Z'
        }]);

        const result = await posRepository.getReportsOverview({ date_from: '2026-08-24', date_to: '2026-08-24', location_id: 12 });

        expect(result.daily_report.cashier_summary[0]).toEqual(expect.objectContaining({ cashier_id: 22, cashier_name: 'Cashier B' }));
        expect(result.daily_report.transaction_rows[0]).toEqual(expect.objectContaining({ operator_session_id: 701, attribution_type: 'authenticated_operator' }));
        expect(result.cashier_lifecycle.attendance.rows[0]).toEqual(expect.objectContaining({ break_minutes: 60, worked_minutes: 420 }));
        expect(result.cashier_lifecycle.operators.rows[0]).toEqual(expect.objectContaining({ cashier_name: 'Cashier B', shift_id: 81 }));
        expect(result.cashier_lifecycle.handoffs.rows[0]).toEqual(expect.objectContaining({ variance_attribution: 'shared_drawer_no_individual_variance' }));
        expect(result.cashier_lifecycle.registers[0]).toEqual(expect.objectContaining({ opening_cashier_name: 'Cashier A', variance_amount: -5 }));
        expect(result.cashier_lifecycle.reconciliation).toEqual(expect.objectContaining({ difference: 0, reconciled: true }));
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

    it('discloses refund adjustments by adjustment event time without changing sales totals twice', async () => {
        mockFindAll.mockResolvedValue([]);
        mockAdjustmentFindAll.mockResolvedValue([{
            pos_transaction_adjustment_id: 901,
            adjustment_reference: 'PRA-901',
            pos_transaction_id: 201,
            adjustment_type: 'cash_refund',
            tender_type: 'cash',
            amount: 90,
            currency: 'PHP',
            status: 'succeeded',
            reason: 'Customer return',
            original_cashier_id: 10,
            original_shift_id: 4,
            original_terminal_id: 'POS-02',
            original_location_id: 15,
            actor_user_id: 99,
            actor_shift_id: 8,
            actor_terminal_id: 'POS-03',
            actor_location_id: 15,
            completed_at: '2026-06-23T01:00:00.000Z',
            created_at: '2026-06-23T01:00:00.000Z',
            transaction: { invoice_number: 'INV-201' },
            originalCashier: { username: 'cashier-2' },
            actorUser: { username: 'admin-1' },
            metadata: { financial_outcome: { refund_state: 'completed' } }
        }]);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-06-23',
            date_to: '2026-06-23',
            location_id: 15,
            cashier_id: 10
        });

        expect(result.daily_report.summary.net_sales).toBe(0);
        expect(result.daily_report.summary.refunds_voids).toBe(0);
        expect(result.daily_report.adjustment_summary).toEqual(expect.objectContaining({
            adjustment_count: 1,
            succeeded_amount: 90,
            net_sales_impact: 0,
            mutates_prior_z_reading: false
        }));
        expect(result.daily_report.adjustment_rows).toEqual([
            expect.objectContaining({
                adjustment_reference: 'PRA-901',
                event_at: '2026-06-23T01:00:00.000Z',
                invoice_number: 'INV-201',
                original_cashier_name: 'cashier-2',
                actor_name: 'admin-1'
            })
        ]);
        const adjustmentWhere = mockAdjustmentFindAll.mock.calls[0][0].where;
        expect(adjustmentWhere.adjustment_type[Op.in]).toContain('cash_refund');
        expect(adjustmentWhere[Op.and]).toEqual(expect.arrayContaining([
            { original_cashier_id: 10 }
        ]));
    });

    it('returns post-close refund details with original cashier and acting administrator context', async () => {
        mockAdjustmentFindAll.mockResolvedValue([{
            pos_transaction_adjustment_id: 902,
            adjustment_reference: 'PRA-902',
            adjustment_type: 'external_refund',
            tender_type: 'gcash',
            amount: 125,
            status: 'manual_review_required',
            reason: 'Reference requires review',
            original_cashier_id: 7,
            original_shift_id: 46,
            original_terminal_id: 'COUNTER-01',
            original_location_id: 9,
            actor_user_id: 1,
            actor_shift_id: null,
            actor_terminal_id: 'COUNTER-01',
            actor_location_id: 9,
            created_at: '2026-08-15T10:00:00.000Z',
            originalCashier: { username: 'Cashier One' },
            actorUser: { username: 'Admin One' }
        }]);

        const result = await posRepository.getPostCloseAdjustmentSummaryForShift({
            shiftId: 46,
            closedAt: '2026-08-15T09:00:00.000Z',
            terminalId: 'COUNTER-01',
            locationId: 9
        });

        expect(result).toEqual(expect.objectContaining({
            post_close_adjustment_count: 1,
            post_close_refund_amount: 0,
            post_close_manual_review_amount: 125
        }));
        expect(result.post_close_adjustments[0]).toEqual(expect.objectContaining({
            original_cashier_name: 'Cashier One',
            actor_name: 'Admin One',
            actor_shift_id: null
        }));
    });

    it('uses the item Food Category for report filters and top-item output', async () => {
        mockItemFolderFindAll.mockResolvedValue([{ folder_id: 8, name: 'Mains' }]);
        mockFindAll.mockResolvedValue([
            {
                pos_transaction_id: 250,
                created_at: '2026-06-22T10:30:00.000Z',
                status: 'completed',
                payment_status: 'paid',
                subtotal_amount: 120,
                discount_amount: 0,
                service_fee_amount: 0,
                restaurant_service_charge_amount: 0,
                vat_amount: 14.4,
                payment_type: 'cash',
                order_source: 'in_store',
                order_method: 'dine_in',
                lines: [{
                    item_id: 15,
                    quantity: 1,
                    cost_snapshot: 45,
                    line_subtotal: 120,
                    item: {
                        item_id: 15,
                        name: 'Beef Meal',
                        sku_code: 'DGFTY-ITEM-000015',
                        category: 'product',
                        product_folder: 'Mains',
                        folder_id: 8,
                        folder: { folder_id: 8, name: 'Mains' },
                        cost_per_unit: 45
                    }
                }]
            }
        ]);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-06-22',
            date_to: '2026-06-22',
            category_id: 8
        });

        expect(result.filter_options.categories).toEqual([{ folder_id: 8, name: 'Mains' }]);
        expect(result.daily_report.top_items).toEqual([
            expect.objectContaining({ item_name: 'Beef Meal', category: 'Mains' })
        ]);

        const itemInclude = mockFindAll.mock.calls[0][0].include[0].include[0];
        expect(itemInclude.attributes).toEqual(expect.arrayContaining(['product_folder', 'folder_id']));
        expect(itemInclude.include[0]).toEqual(expect.objectContaining({
            model: ItemFolderModel,
            as: 'folder'
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
                discount_amount: 10,
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
            discounts: 0,
            refunds_voids: 60,
            cogs: 20,
            pos_profit_loss: -20,
            is_loss: true
        }));
        expect(result.daily_report.discount_breakdown).toEqual([]);
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

    it('includes a void created exactly at shift close in the post-close summary', async () => {
        mockFindAll.mockResolvedValue([{ post_close_void_transaction_count: 1, post_close_void_amount: 125 }]);

        await posRepository.getPostCloseVoidSummaryForShift({
            shiftId: 7,
            closedAt: '2026-06-22T10:00:00.000Z',
            terminalId: 'POS-01',
            locationId: 12
        });

        const where = mockFindAll.mock.calls[0][0].where;
        expect(where.voided_at[Op.gte]).toEqual(new Date('2026-06-22T10:00:00.000Z'));
        expect(where.voided_at[Op.lte]).toBeInstanceOf(Date);
        expect(where.shift_id).toBe(7);
        expect(where.terminal_id).toBe('POS-01');
        expect(where.location_id).toBe(12);
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
