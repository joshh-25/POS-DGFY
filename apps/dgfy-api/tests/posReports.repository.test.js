import { jest } from '@jest/globals';
import { Op } from 'sequelize';

const mockFindAll = jest.fn();
const mockFindOne = jest.fn();
const mockLineFindAll = jest.fn();
const mockItemFolderFindAll = jest.fn();
const mockShiftFindAll = jest.fn();
const mockAdjustmentFindAll = jest.fn();
const mockAttendanceFindAll = jest.fn();
const mockOperatorFindAll = jest.fn();
const mockHandoffFindAll = jest.fn();
const mockZReadingSnapshotFindOne = jest.fn();
const mockZReadingSnapshotFindAndCountAll = jest.fn();
const mockUserFindAll = jest.fn();
const mockSequelize = {
    fn: jest.fn((...args) => ({ fn: args })),
    col: jest.fn((name) => ({ col: name })),
    where: jest.fn((left, right) => ({ where: [left, right] })),
    literal: jest.fn((value) => ({ literal: value }))
};

const PosTransactionModel = { modelName: 'PosTransaction', findAll: mockFindAll, findOne: mockFindOne, sequelize: mockSequelize };
const PosTransactionLineModel = { modelName: 'PosTransactionLine', findAll: mockLineFindAll };
const ItemModel = { modelName: 'Item' };
const ItemFolderModel = { modelName: 'ItemFolder', findAll: mockItemFolderFindAll };
const UserModel = { modelName: 'User', findAll: mockUserFindAll };
const PosTerminalShiftModel = { modelName: 'PosTerminalShift', findAll: mockShiftFindAll };
const PosCashDrawerEventModel = { modelName: 'PosCashDrawerEvent' };
const PosTransactionDiscountModel = { modelName: 'PosTransactionDiscount' };
const PosTransactionDiscountLineModel = { modelName: 'PosTransactionDiscountLine' };
const PosTransactionAdjustmentModel = { modelName: 'PosTransactionAdjustment', findAll: mockAdjustmentFindAll };
const EmployeeAttendanceSessionModel = { modelName: 'EmployeeAttendanceSession', findAll: mockAttendanceFindAll };
const EmployeeBreakSegmentModel = { modelName: 'EmployeeBreakSegment' };
const PosTerminalOperatorSessionModel = { modelName: 'PosTerminalOperatorSession', findAll: mockOperatorFindAll };
const PosDrawerHandoffEventModel = { modelName: 'PosDrawerHandoffEvent', findAll: mockHandoffFindAll };
const TenantLocationModel = { modelName: 'TenantLocation', findByPk: jest.fn() };
const PosZReadingSnapshotModel = {
    modelName: 'PosZReadingSnapshot',
    findOne: mockZReadingSnapshotFindOne,
    findAndCountAll: mockZReadingSnapshotFindAndCountAll
};

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
                case 'TenantLocation':
                    return TenantLocationModel;
                case 'PosZReadingSnapshot':
                    return PosZReadingSnapshotModel;
                default:
                    return null;
            }
        }),
        getStore: jest.fn(() => null)
    }
}));

let posRepository;
let resolveCanonicalTransactionDiscountAmount;

beforeAll(async () => {
    ({ posRepository, resolveCanonicalTransactionDiscountAmount } = await import('../src/modules/pos/repositories/posRepository.js'));
});

describe('posRepository reports analytics', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindOne.mockResolvedValue(null);
        mockItemFolderFindAll.mockResolvedValue([]);
        mockShiftFindAll.mockResolvedValue([]);
        mockLineFindAll.mockResolvedValue([{ post_close_voided_item_count: 0 }]);
        mockAdjustmentFindAll.mockResolvedValue([]);
        mockAttendanceFindAll.mockResolvedValue([]);
        mockOperatorFindAll.mockResolvedValue([]);
        mockHandoffFindAll.mockResolvedValue([]);
        mockZReadingSnapshotFindOne.mockResolvedValue(null);
        mockZReadingSnapshotFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
        mockUserFindAll.mockResolvedValue([]);
    });

    it('uses one canonical discount source with safe legacy fallbacks', () => {
        expect(resolveCanonicalTransactionDiscountAmount({
            discount_amount: 99,
            discount: {
                discount_amount: 12,
                lines: [
                    { beneficiary_id: null, discount_amount: 5 },
                    { beneficiary_id: null, discount_amount: 7 },
                    { beneficiary_id: 4, discount_amount: 12 }
                ]
            }
        })).toBe(12);

        expect(resolveCanonicalTransactionDiscountAmount({
            discount_amount: 99,
            discount: { discount_amount: 12, lines: [] }
        })).toBe(12);

        expect(resolveCanonicalTransactionDiscountAmount({ discount_amount: 99 })).toBe(99);
    });

    it('uses the canonical persisted discount source for Z-reading totals', async () => {
        mockFindAll.mockImplementation(async (options = {}) => {
            const includes = Array.isArray(options.include) ? options.include : [];
            if (includes.some((include) => include?.as === 'discount')) {
                return [{
                    pos_transaction_id: 501,
                    discount_amount: 0,
                    discount: {
                        discount_amount: 12,
                        lines: [
                            { beneficiary_id: null, discount_amount: 5 },
                            { beneficiary_id: null, discount_amount: 7 }
                        ]
                    }
                }];
            }
            return [];
        });
        mockLineFindAll.mockResolvedValue([]);

        const result = await posRepository.getZReadingSummary({
            startAt: new Date('2026-09-05T00:00:00.000Z'),
            endAt: new Date('2026-09-06T00:00:00.000Z'),
            locationId: 12
        });

        expect(result.discount_amount).toBe(12);
        expect(mockFindAll).toHaveBeenCalledWith(expect.objectContaining({
            include: expect.arrayContaining([
                expect.objectContaining({ as: 'discount' })
            ])
        }));
    });

    it('exposes the first transaction date and Manila today as report display bounds', async () => {
        mockFindAll.mockResolvedValue([]);
        mockFindOne.mockResolvedValue({ created_at: '2026-05-01T16:00:00.000Z' });

        const result = await posRepository.getReportsOverview({
            date_from: '2026-09-18',
            date_to: '2026-09-18'
        });

        expect(result.date_bounds).toEqual(expect.objectContaining({
            first_transaction_date: '2026-05-02',
            today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
        }));
        expect(mockFindOne).toHaveBeenCalledWith(expect.objectContaining({
            attributes: ['created_at'],
            order: [['created_at', 'ASC'], ['pos_transaction_id', 'ASC']],
            raw: true
        }));
    });

    it('loads the previous equivalent range for accurate comparison metrics and trend points', async () => {
        const makeTransaction = (id, createdAt, lineSubtotal, costSnapshot) => ({
            pos_transaction_id: id,
            created_at: createdAt,
            status: 'completed',
            payment_status: 'paid',
            subtotal_amount: lineSubtotal,
            discount_amount: 0,
            service_fee_amount: 0,
            restaurant_service_charge_amount: 0,
            vat_amount: 0,
            payment_type: 'cash',
            order_source: 'in_store',
            order_method: 'dine_in',
            cashier: { user_id: 9, username: 'cashier-1' },
            lines: [{
                line_id: id,
                item_id: 1,
                quantity: 1,
                cost_snapshot: costSnapshot,
                line_subtotal: lineSubtotal,
                item: {
                    item_id: 1,
                    name: 'Meal',
                    sku_code: `MEAL-${id}`,
                    category: 'product',
                    cost_per_unit: costSnapshot
                }
            }]
        });

        mockFindAll
            .mockResolvedValueOnce([makeTransaction(701, '2026-08-28T02:00:00.000Z', 100, 40)])
            .mockResolvedValueOnce([makeTransaction(702, '2026-08-27T02:00:00.000Z', 80, 40)]);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-08-28',
            date_to: '2026-08-28'
        });

        expect(result.sales_comparison.flexible_range).toEqual(expect.objectContaining({
            current: expect.objectContaining({ net_sales: 100, pos_profit_loss: 60 }),
            previous: expect.objectContaining({ net_sales: 80, pos_profit_loss: 40 }),
            sales_delta: 20,
            sales_delta_percentage: 25,
            current_range: { dateFrom: '2026-08-28', dateTo: '2026-08-28' },
            previous_range: { dateFrom: '2026-08-27', dateTo: '2026-08-27' }
        }));
        expect(result.sales_comparison.flexible_trend).toEqual([
            expect.objectContaining({
                label: '2026-08-28',
                current_period: '2026-08-28',
                previous_period: '2026-08-27',
                current_net_sales: 100,
                previous_net_sales: 80
            })
        ]);
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
            quantity_sold: 2,
            orders: 1,
            average_price: 45,
            sales_share_percentage: 64.2857,
            cogs: 60,
            pos_profit_loss: 30
        }));
        expect(result.daily_report.top_items[1]).toEqual(expect.objectContaining({
            item_name: 'Burger',
            quantity: 1,
            cogs: 20,
            pos_profit_loss: 30
        }));
        expect(result.profit_loss.rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                rank: 1,
                item_name: 'Chicken',
                item_sold: 2,
                gross_sales: 100,
                cogs: 60,
                net_sales: 90,
                net_profit: 30,
                loss: 0,
                profit_margin: 33.3333
            }),
            expect.objectContaining({
                item_name: 'Burger',
                net_profit: 30,
                loss: 0,
                profit_margin: 60
            })
        ]));
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
                payment_methods: ['cash'],
                order_method: 'dine_in',
                total_amount: 90,
                discount_amount: 10,
                gross_sales: 100,
                net_sales: 90,
                pos_profit_loss: 70
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

    it('returns one register row per shift and derives screenshot variance instead of trusting stored variance', async () => {
        mockFindAll.mockResolvedValue([]);
        mockShiftFindAll.mockResolvedValue([
            {
                pos_terminal_shift_id: 147,
                business_date: '2026-09-18',
                terminal_id: 'POS-01',
                location_id: 12,
                cashier_id: 9,
                status: 'closed',
                opening_float_amount: 0,
                expected_cash_amount: 75994.83,
                closing_cash_amount: 71931.83,
                cash_variance_amount: 150,
                cashier: { user_id: 9, username: 'Admin' },
                cashEvents: []
            },
            {
                pos_terminal_shift_id: 148,
                business_date: '2026-09-18',
                terminal_id: 'POS-01',
                location_id: 12,
                cashier_id: 9,
                status: 'closed',
                opening_float_amount: 0,
                expected_cash_amount: 100,
                closing_cash_amount: 120,
                cash_variance_amount: 20,
                cashier: { user_id: 9, username: 'Admin' },
                cashEvents: []
            }
        ]);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-09-18',
            date_to: '2026-09-18',
            location_id: 12
        });

        expect(result.cashier_lifecycle.registers).toEqual([
            expect.objectContaining({
                shift_id: 147,
                opening_cashier_name: 'Admin',
                expected_cash_amount: 75994.83,
                closing_cash_amount: 71931.83,
                variance_amount: -4063
            }),
            expect.objectContaining({
                shift_id: 148,
                expected_cash_amount: 100,
                closing_cash_amount: 120,
                variance_amount: 20
            })
        ]);
        expect(result.cashier_lifecycle.registers.every((row) => !Object.hasOwn(row, 'shift_ids'))).toBe(true);

        const cashierAggregate = result.daily_report.cash_reconciliation[0];
        expect(cashierAggregate).toEqual(expect.objectContaining({
            shift_ids: [147, 148],
            shift_count: 2,
            closed_shift_count: 2,
            expected_cash_amount: 76094.83,
            closing_cash_amount: 72051.83,
            reconciliation_complete: true,
            cash_variance_amount: -4043
        }));

        const diagnostics = result._internal_register_variance_diagnostics;
        expect(diagnostics).toEqual({
            variance_mismatch_count: 1,
            variance_mismatch_samples: [{
                shift_id: 147,
                location_id: 12,
                stored_variance_amount: 150,
                derived_variance_amount: -4063,
                delta: 4213
            }]
        });
        expect(Object.keys(result)).not.toContain('_internal_register_variance_diagnostics');
        expect(JSON.stringify(result)).not.toContain('_internal_register_variance_diagnostics');
    });

    it('keeps mixed open and closed cashier aggregates incomplete and leaves open variance null', async () => {
        mockFindAll.mockResolvedValue([]);
        mockShiftFindAll.mockResolvedValue([
            {
                pos_terminal_shift_id: 201,
                business_date: '2026-09-19',
                terminal_id: 'POS-01',
                location_id: 12,
                cashier_id: 10,
                status: 'closed',
                opening_float_amount: 0,
                expected_cash_amount: 100,
                closing_cash_amount: 90,
                cash_variance_amount: -10,
                cashier: { user_id: 10, username: 'Cashier A' },
                cashEvents: []
            },
            {
                pos_terminal_shift_id: 202,
                business_date: '2026-09-19',
                terminal_id: 'POS-01',
                location_id: 12,
                cashier_id: 10,
                status: 'open',
                opening_float_amount: 0,
                expected_cash_amount: 200,
                closing_cash_amount: null,
                cash_variance_amount: 55,
                cashier: { user_id: 10, username: 'Cashier A' },
                cashEvents: []
            }
        ]);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-09-19',
            date_to: '2026-09-19',
            location_id: 12
        });

        expect(result.cashier_lifecycle.registers).toEqual([
            expect.objectContaining({ shift_id: 201, variance_amount: -10 }),
            expect.objectContaining({ shift_id: 202, closing_cash_amount: null, variance_amount: null })
        ]);
        expect(result.daily_report.cash_reconciliation[0]).toEqual(expect.objectContaining({
            shift_count: 2,
            closed_shift_count: 1,
            closing_cash_amount: 90,
            reconciliation_complete: false,
            cash_variance_amount: null
        }));
    });

    it('applies an authorized multi-branch location filter to every lifecycle stream', async () => {
        const result = await posRepository.getCashierLifecycleReport({
            date_from: '2026-08-24',
            date_to: '2026-08-24',
            location_ids: [12, '15', 0, 'invalid', 12]
        });

        expect(result).toEqual(expect.objectContaining({
            attendance: expect.any(Object),
            operators: expect.any(Object)
        }));
        for (const mock of [mockAttendanceFindAll, mockOperatorFindAll, mockHandoffFindAll]) {
            expect(mock).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ location_id: { [Op.in]: [12, 15] } })
            }));
        }
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

    it('allocates VAT by the sale-time line tax class when a mixed-VAT invoice is filtered', async () => {
        mockFindAll.mockResolvedValue([{
            pos_transaction_id: 260,
            created_at: '2026-06-22T10:45:00.000Z',
            status: 'completed',
            payment_status: 'paid',
            subtotal_amount: 210,
            vatable_sales: 98.2143,
            vat_amount: 11.7857,
            total_amount: 210,
            discount_amount: 0,
            service_fee_amount: 0,
            restaurant_service_charge_amount: 0,
            payment_type: 'cash',
            order_source: 'in_store',
            order_method: 'dine_in',
            lines: [
                {
                    line_id: 2601,
                    item_id: 26,
                    quantity: 1,
                    line_subtotal: 110,
                    vat_type_snapshot: 'vatable',
                    item: { item_id: 26, name: 'Meal', category: 'food' }
                },
                {
                    line_id: 2602,
                    item_id: 27,
                    quantity: 1,
                    line_subtotal: 100,
                    vat_type_snapshot: 'vat_exempt',
                    item: { item_id: 27, name: 'Exempt Supply', category: 'supplies' }
                }
            ]
        }]);

        const filteredResult = await posRepository.getReportsOverview({
            date_from: '2026-06-22',
            date_to: '2026-06-22',
            category: 'supplies'
        });

        expect(filteredResult.daily_report.summary).toEqual(expect.objectContaining({
            gross_sales: 100,
            vatable_sales: 0,
            vat: 0
        }));
        expect(filteredResult.daily_report.transaction_rows[0]).toEqual(expect.objectContaining({
            gross_sales: 100,
            vatable_sales: 0,
            vat_amount: 0
        }));

        const unfilteredResult = await posRepository.getReportsOverview({
            date_from: '2026-06-22',
            date_to: '2026-06-22'
        });

        expect(unfilteredResult.daily_report.summary).toEqual(expect.objectContaining({
            vatable_sales: 98.2143,
            vat: 11.7857
        }));
    });

    it('uses sale-time gross for governed discounts and subtracts VAT removal once', async () => {
        mockFindAll.mockResolvedValue([{
            pos_transaction_id: 261,
            created_at: '2026-06-22T10:45:00.000Z',
            status: 'completed',
            payment_status: 'paid',
            subtotal_amount: 90,
            discount_amount: 16.0714,
            vat_removed: 9.6429,
            vatable_sales: 0,
            vat_exempt_sales: 64.2857,
            vat_amount: 0,
            total_amount: 64.2857,
            payment_type: 'cash',
            order_source: 'in_store',
            order_method: 'dine_in',
            discount_label_snapshot: 'PWD',
            cashier_id: 9,
            cashier: { user_id: 9, username: 'cashier-1' },
            discount: {
                discount_type: 'pwd',
                discount_amount: 16.0714,
                vat_removed: 9.6429,
                lines: [{
                    transaction_line_id: 2611,
                    beneficiary_id: null,
                    gross_eligible_amount: 90,
                    discount_amount: 16.0714,
                    vat_removed: 9.6429,
                    vat_exempt_amount: 80.3571,
                    final_line_amount: 64.2857
                }]
            },
            lines: [{
                line_id: 2611,
                item_id: 26,
                quantity: 1,
                sale_price: 90,
                line_subtotal: 64.2857,
                vat_type_snapshot: 'vatable',
                item: { item_id: 26, name: 'Meal', category: 'food' }
            }]
        }]);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-06-22',
            date_to: '2026-06-22'
        });

        expect(result.daily_report.summary).toEqual(expect.objectContaining({
            gross_sales: 90,
            net_sales: 64.2857,
            discounts: 16.0714,
            refunds_voids: 0,
            vatable_sales: 0,
            vat: 0
        }));
        expect(result.daily_report.discount_breakdown).toEqual([
            expect.objectContaining({
                discount_type: 'pwd',
                discount_amount: 16.0714,
                vat_removed: 9.6429
            })
        ]);
        expect(result.daily_report.transaction_rows[0]).toEqual(expect.objectContaining({
            gross_sales: 90,
            net_sales: 64.2857,
            discount_amount: 16.0714
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
        expect(where.payment_type).toBeUndefined();
        expect(where[Op.and]).toEqual(expect.arrayContaining([
            expect.objectContaining({ [Op.or]: expect.arrayContaining([
                { payment_type: 'cash' },
                expect.objectContaining({ literal: expect.stringContaining('JSON_SEARCH') })
            ]) })
        ]));
        expect(where[Op.or]).toEqual(expect.arrayContaining([
            { order_source: 'in_store' },
            { order_source: null },
            { order_source: 'online_store', fulfillment_status: 'completed' }
        ]));
        expect(where[Op.and]).toEqual(expect.arrayContaining([
            { order_method: 'pickup' }
        ]));
    });

    it('reconciles a filtered GCash report with a GCash leg inside a Cash-primary split sale', async () => {
        const transactions = Array.from({ length: 6 }, (_, index) => {
            const amount = index === 5 ? 280 : 200;
            return {
                pos_transaction_id: index + 1,
                created_at: '2026-09-05T03:00:00.000Z',
                status: 'completed',
                payment_status: 'paid',
                subtotal_amount: amount,
                total_amount: amount,
                discount_amount: 0,
                service_fee_amount: 0,
                restaurant_service_charge_amount: 0,
                vat_amount: 0,
                payment_type: 'gcash',
                payment_breakdown: [{ payment_type: 'gcash', count: 1, amount }],
                cashier_id: 9,
                cashier: { user_id: 9, username: 'cashier-1' },
                lines: [{ item_id: index + 1, quantity: 1, cost_snapshot: 0, line_subtotal: amount, item: { item_id: index + 1, name: `Item ${index + 1}`, category: 'product', cost_per_unit: 0 } }]
            };
        });
        transactions.push({
            pos_transaction_id: 7,
            created_at: '2026-09-05T04:00:00.000Z',
            status: 'completed',
            payment_status: 'paid',
            subtotal_amount: 465,
            total_amount: 465,
            discount_amount: 0,
            service_fee_amount: 0,
            restaurant_service_charge_amount: 0,
            vat_amount: 0,
            payment_type: 'cash',
            payment_breakdown: [
                { payment_type: 'gcash', count: 1, amount: 365 },
                { payment_type: 'cash', count: 1, amount: 100 }
            ],
            cashier_id: 9,
            cashier: { user_id: 9, username: 'cashier-1' },
            lines: [{ item_id: 7, quantity: 1, cost_snapshot: 0, line_subtotal: 465, item: { item_id: 7, name: 'Split item', category: 'product', cost_per_unit: 0 } }]
        });
        mockFindAll.mockResolvedValue(transactions);

        const result = await posRepository.getReportsOverview({
            date_from: '2026-09-05',
            date_to: '2026-09-05',
            payment_type: 'gcash'
        });

        expect(result.summary_cards.selected_tender).toEqual({
            payment_type: 'gcash',
            payment_label: 'GCash',
            amount: 1645,
            transaction_count: 7
        });
        expect(result.summary_cards.total_transactions).toBe(7);
        expect(result.summary_cards.total_sales).toBe(1745);
        expect(result.daily_report.payment_breakdown).toEqual(expect.arrayContaining([
            expect.objectContaining({ payment_method: 'GCash', total_transactions: 7, net_sales: 1645 }),
            expect.objectContaining({ payment_method: 'Cash', total_transactions: 1, net_sales: 100 })
        ]));
        expect(result.daily_report.transaction_rows.at(-1)).toEqual(expect.objectContaining({
            payment_type: 'cash',
            payment_methods: ['gcash', 'cash']
        }));

        // A historical snapshot survives a void/refund; it must not inflate collected tender.
        transactions[6].status = 'voided';
        const voidedResult = await posRepository.getReportsOverview({ payment_type: 'gcash' });
        expect(voidedResult.summary_cards.selected_tender.amount).toBe(1280);
        expect(voidedResult.summary_cards.selected_tender.transaction_count).toBe(6);
        transactions[6].status = 'completed';
        transactions[6].payment_status = 'refunded';
        const refundedResult = await posRepository.getReportsOverview({ payment_type: 'gcash' });
        expect(refundedResult.summary_cards.selected_tender.amount).toBe(1280);
    });

    it('returns a Z-reading reconciliation using the completed recognized transaction total', async () => {
        mockFindAll.mockResolvedValue([{
            pos_transaction_id: 901,
            created_at: '2026-09-05T03:00:00.000Z',
            status: 'completed',
            payment_status: 'paid',
            subtotal_amount: 90,
            total_amount: 90,
            discount_amount: 0,
            service_fee_amount: 0,
            restaurant_service_charge_amount: 0,
            vat_amount: 0,
            payment_type: 'cash',
            order_source: 'in_store',
            order_method: 'dine_in',
            cashier_id: 9,
            cashier: { user_id: 9, username: 'cashier-1' },
            lines: [{
                item_id: 1,
                quantity: 1,
                cost_snapshot: 0,
                line_subtotal: 90,
                item: { item_id: 1, name: 'Item 1', category: 'product', cost_per_unit: 0 }
            }]
        }]);
        mockZReadingSnapshotFindOne.mockResolvedValue({
            business_date: '2026-09-05',
            location_id: 12,
            reading_identifier: 'ZR-20260905-001',
            generated_at: '2026-09-05T15:00:00.000Z',
            summary: JSON.stringify({
                total_amount: 90,
                void_transaction_count: 1,
                void_amount: 20
            })
        });

        const result = await posRepository.getReportsOverview({
            date_from: '2026-09-05',
            date_to: '2026-09-05',
            location_id: 12
        });

        expect(result.z_reading_reconciliation).toEqual(expect.objectContaining({
            status: 'matched',
            comparison_basis: 'completed_recognized_transaction_total',
            business_date: '2026-09-05',
            location_id: 12,
            reading_identifier: 'ZR-20260905-001',
            generated_at: '2026-09-05T15:00:00.000Z',
            report_recognized_sales: 90,
            z_total_amount: 90,
            variance: 0,
            z_void_transaction_count: 1,
            z_void_amount: 20
        }));
    });

    it('does not treat a malformed Z-reading summary as a zero-value match', async () => {
        mockFindAll.mockResolvedValue([]);
        mockZReadingSnapshotFindOne.mockResolvedValue({
            business_date: '2026-09-05',
            location_id: 12,
            reading_identifier: 'ZR-20260905-002',
            generated_at: '2026-09-05T15:00:00.000Z',
            summary: {}
        });

        const result = await posRepository.getReportsOverview({
            date_from: '2026-09-05',
            date_to: '2026-09-05',
            location_id: 12
        });

        expect(result.z_reading_reconciliation).toEqual(expect.objectContaining({
            status: 'not_comparable',
            reading_identifier: 'ZR-20260905-002',
            generated_at: '2026-09-05T15:00:00.000Z',
            z_total_amount: null,
            variance: null,
            message: 'The Z-reading snapshot does not contain a comparable total.'
        }));
    });

    it('does not claim a Z-reading match for filtered or multi-day reports', async () => {
        mockFindAll.mockResolvedValue([]);

        const filtered = await posRepository.getReportsOverview({
            date_from: '2026-09-05',
            date_to: '2026-09-05',
            location_id: 12,
            payment_type: 'cash'
        });
        const multiDay = await posRepository.getReportsOverview({
            date_from: '2026-09-05',
            date_to: '2026-09-06',
            location_id: 12
        });

        expect(filtered.z_reading_reconciliation).toEqual(expect.objectContaining({
            status: 'not_comparable',
            variance: null
        }));
        expect(multiDay.z_reading_reconciliation).toEqual(expect.objectContaining({
            status: 'not_comparable',
            business_date: null,
            variance: null
        }));
    });

    it('builds hourly, item, and category breakdowns from the normalized POS line pipeline', async () => {
        mockFindAll.mockResolvedValue([
            {
                pos_transaction_id: 501,
                created_at: '2026-09-01T00:15:00.000Z',
                status: 'completed',
                payment_status: 'paid',
                subtotal_amount: 100,
                total_amount: 112,
                discount_amount: 0,
                vatable_sales: 100,
                vat_amount: 12,
                service_fee_amount: 0,
                restaurant_service_charge_amount: 0,
                payment_type: 'cash',
                cashier: { user_id: 9, username: 'cashier-1' },
                lines: [{
                    line_id: 1,
                    item_id: 21,
                    item_name_snapshot: 'Coffee',
                    sku_snapshot: 'COF-21',
                    quantity: 2,
                    cost_snapshot: 10,
                    line_subtotal: 100,
                    item: {
                        item_id: 21,
                        name: 'Coffee',
                        sku_code: 'COF-21',
                        folder_id: 4,
                        folder: { folder_id: 4, name: 'Drinks' }
                    }
                }]
            },
            {
                pos_transaction_id: 502,
                created_at: '2026-09-01T01:20:00.000Z',
                status: 'completed',
                payment_status: 'paid',
                subtotal_amount: 50,
                total_amount: 56,
                discount_amount: 0,
                vatable_sales: 50,
                vat_amount: 6,
                service_fee_amount: 0,
                restaurant_service_charge_amount: 0,
                payment_type: 'cash',
                cashier: { user_id: 9, username: 'cashier-1' },
                lines: [{
                    line_id: 2,
                    item_id: 21,
                    item_name_snapshot: 'Coffee',
                    sku_snapshot: 'COF-21',
                    quantity: 1,
                    cost_snapshot: 10,
                    line_subtotal: 50,
                    item: {
                        item_id: 21,
                        name: 'Coffee',
                        sku_code: 'COF-21',
                        folder_id: 4,
                        folder: { folder_id: 4, name: 'Drinks' }
                    }
                }]
            }
        ]);

        const itemResult = await posRepository.getReportBreakdown({
            date_from: '2026-09-01',
            date_to: '2026-09-01',
            breakdown: 'items',
            page: 1,
            limit: 50
        });
        const hourlyResult = await posRepository.getReportBreakdown({
            date_from: '2026-09-01',
            date_to: '2026-09-01',
            breakdown: 'hourly'
        });
        const categoryResult = await posRepository.getReportBreakdown({
            date_from: '2026-09-01',
            date_to: '2026-09-01',
            breakdown: 'categories'
        });

        expect(itemResult.summary).toEqual(expect.objectContaining({
            total_transactions: 2,
            total_items_sold: 3,
            net_sales: 150,
            cogs: 30,
            profit: 120
        }));
        expect(itemResult.rows).toHaveLength(1);
        expect(itemResult.rows[0]).toEqual(expect.objectContaining({
            item_key: 'item:21',
            item_name: 'Coffee',
            category_key: 'folder:4',
            category_name: 'Drinks',
            quantity: 3,
            orders: 2,
            net_sales: 150,
            profit: 120,
            sales_share: 100
        }));
        expect(hourlyResult.rows.map((row) => row.bucket_start_local)).toEqual([
            '2026-09-01T08:00:00+08:00',
            '2026-09-01T09:00:00+08:00'
        ]);
        expect(hourlyResult.rows[0]).toEqual(expect.objectContaining({
            transaction_count: 1,
            item_quantity: 2,
            net_sales: 100,
            vat: 12
        }));
        expect(categoryResult.rows[0]).toEqual(expect.objectContaining({
            category_key: 'folder:4',
            category_name: 'Drinks',
            item_count: 1,
            quantity: 3,
            orders: 2,
            sales_share: 100
        }));
        expect(categoryResult.rows[0]).toHaveProperty('item_count', 1);
        expect(itemResult.pagination).toEqual(expect.objectContaining({
            total_rows: 1,
            total_pages: 1,
            has_next: false
        }));
    });

    it('counts split-tender lines once and preserves sale-time item snapshots and void totals', async () => {
        mockFindAll.mockResolvedValue([
            {
                pos_transaction_id: 601,
                created_at: '2026-09-03T00:15:00.000Z',
                status: 'completed',
                payment_status: 'paid',
                subtotal_amount: 100,
                total_amount: 112,
                discount_amount: 0,
                vatable_sales: 100,
                vat_amount: 12,
                payment_type: 'cash',
                payment_breakdown: [
                    { payment_type: 'cash', amount: 40 },
                    { payment_type: 'gcash', amount: 72 }
                ],
                lines: [{
                    line_id: 1,
                    item_id: 11,
                    item_name_snapshot: 'Sale-time Coffee',
                    sku_snapshot: 'OLD-COF',
                    quantity: 2,
                    cost_snapshot: 10,
                    line_subtotal: 100,
                    item: { item_id: 11, name: 'Renamed Coffee', sku_code: 'NEW-COF' }
                }]
            },
            {
                pos_transaction_id: 602,
                created_at: '2026-09-03T01:15:00.000Z',
                status: 'voided',
                payment_status: 'paid',
                subtotal_amount: 50,
                total_amount: 56,
                discount_amount: 0,
                vatable_sales: 50,
                vat_amount: 6,
                payment_type: 'cash',
                lines: [{
                    line_id: 2,
                    item_id: 12,
                    item_name_snapshot: 'Voided Tea',
                    sku_snapshot: 'TEA-12',
                    quantity: 1,
                    cost_snapshot: 5,
                    line_subtotal: 50,
                    item: { item_id: 12, name: 'Voided Tea', folder_id: 8, folder: { folder_id: 8, name: 'Tea' } }
                }]
            }
        ]);

        const result = await posRepository.getReportBreakdown({
            date_from: '2026-09-03',
            date_to: '2026-09-03',
            breakdown: 'items'
        });

        expect(result.summary).toEqual(expect.objectContaining({
            total_transactions: 2,
            total_items_sold: 3,
            gross_sales: 150,
            net_sales: 100,
            refunds_voids: 50,
            cogs: 25,
            profit: 75
        }));
        expect(result.rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                item_key: 'item:11',
                item_name: 'Sale-time Coffee',
                sku: 'OLD-COF',
                category_key: 'uncategorized',
                category_name: 'Uncategorized',
                quantity: 2,
                orders: 1,
                net_sales: 100,
                refunds_voids: 0
            }),
            expect.objectContaining({
                item_key: 'item:12',
                category_key: 'folder:8',
                category_name: 'Tea',
                quantity: 1,
                orders: 1,
                net_sales: 0,
                refunds_voids: 50
            })
        ]));
    });

    it('sorts aggregated items before server pagination and returns the inclusive Manila range', async () => {
        const makeTransaction = (id, itemId, itemName, sku) => ({
            pos_transaction_id: id,
            created_at: '2026-09-03T00:15:00.000Z',
            status: 'completed',
            payment_status: 'paid',
            subtotal_amount: 10,
            discount_amount: 0,
            payment_type: 'cash',
            lines: [{
                line_id: id,
                item_id: itemId,
                item_name_snapshot: itemName,
                sku_snapshot: sku,
                quantity: 1,
                cost_snapshot: 1,
                line_subtotal: 10,
                item: { item_id: itemId, name: itemName, sku_code: sku }
            }]
        });
        mockFindAll.mockResolvedValue([
            makeTransaction(611, 11, 'Coffee', 'C-01'),
            makeTransaction(612, 12, 'Tea', 'T-02'),
            makeTransaction(613, 13, 'Water', 'W-03')
        ]);

        const result = await posRepository.getReportBreakdown({
            date_from: '2026-09-03',
            date_to: '2026-09-04',
            breakdown: 'items',
            page: 2,
            limit: 1,
            sort_by: 'sku',
            sort_direction: 'asc'
        });

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toEqual(expect.objectContaining({ item_name: 'Tea', sku: 'T-02' }));
        expect(result.pagination).toEqual(expect.objectContaining({
            page: 2,
            limit: 1,
            total_rows: 3,
            total_pages: 3,
            has_next: true
        }));
        expect(result.range).toEqual(expect.objectContaining({
            date_from: '2026-09-03',
            date_to: '2026-09-04',
            timezone: 'Asia/Manila',
            start_at: '2026-09-02T16:00:00.000Z',
            end_at_exclusive: '2026-09-04T16:00:00.000Z'
        }));
    });

    it('lists persisted Z-readings by authorized branch and optional business-date range', async () => {
        mockZReadingSnapshotFindAndCountAll.mockResolvedValue({
            rows: [{ reading_identifier: 'ZR-20260905-00000001' }],
            count: 1
        });

        const result = await posRepository.listZReadingSnapshots({
            locationId: 12,
            dateFrom: '2026-09-01',
            dateTo: '2026-09-30',
            page: 2,
            limit: 10
        });

        const [options] = mockZReadingSnapshotFindAndCountAll.mock.calls[0];
        expect(options.where.location_id).toBe(12);
        expect(options.where.reading_identifier[Op.like]).toBe('ZR-%');
        expect(options.where.business_date[Op.gte]).toBe('2026-09-01');
        expect(options.where.business_date[Op.lte]).toBe('2026-09-30');
        expect(options.limit).toBe(10);
        expect(options.offset).toBe(10);
        expect(result).toEqual(expect.objectContaining({
            rows: [{ reading_identifier: 'ZR-20260905-00000001', closed_by_display_name: null }],
            pagination: { page: 2, limit: 10, total: 1, totalPages: 1 }
        }));
    });

    it('searches Z-reading history by reading metadata and cashier identity within the branch', async () => {
        mockZReadingSnapshotFindAndCountAll.mockResolvedValue({
            rows: [{
                reading_identifier: 'ZR-20260905-00000001',
                closed_by_user_id: 11,
                closed_from_terminal_id: 'COUNTER-01'
            }],
            count: 1
        });
        mockUserFindAll
            .mockResolvedValueOnce([{ user_id: 11, username: 'Len2', email: 'len2@example.com' }])
            .mockResolvedValueOnce([{ user_id: 11, username: 'Len2', email: 'len2@example.com' }])
            .mockResolvedValueOnce([{ user_id: 11, username: 'Len2', email: 'len2@example.com' }]);

        const result = await posRepository.listZReadingSnapshots({
            locationId: 12,
            search: 'Len2',
            terminalId: 'COUNTER-01',
            closedBy: 'Len2'
        });

        const [options] = mockZReadingSnapshotFindAndCountAll.mock.calls[0];
        expect(options.where.location_id).toBe(12);
        expect(options.where.closed_from_terminal_id[Op.like]).toBe('%COUNTER-01%');
        expect(options.where.closed_by_user_id[Op.in]).toEqual([11]);
        expect(options.where[Op.or]).toEqual(expect.arrayContaining([
            { reading_identifier: { [Op.like]: '%Len2%' } },
            { closed_by_user_id: { [Op.in]: [11] } }
        ]));
        expect(result.rows[0].closed_by_display_name).toBe('Len2');
    });

    it('captures cashier, shift drawer, tender, refund, and invoice details without combining shifts', async () => {
        TenantLocationModel.findByPk.mockResolvedValue({ location_id: 12, name: 'Main Branch' });
        mockShiftFindAll.mockResolvedValue([{
            pos_terminal_shift_id: 31,
            terminal_id: 'COUNTER-01',
            cashier_id: 10,
            opening_float_amount: '100.00',
            expected_cash_amount: '130.00',
            closing_cash_amount: '125.00',
            cash_variance_amount: '-5.00',
            opened_at: '2026-09-05T08:00:00.000Z',
            closed_at: '2026-09-05T16:00:00.000Z',
            cashier: { user_id: 10, username: 'Opening Cashier' },
            operatorSessions: [{
                pos_terminal_operator_session_id: 55,
                user_id: 11,
                started_at: '2026-09-05T09:00:00.000Z',
                ended_at: '2026-09-05T12:00:00.000Z',
                operator: { user_id: 11, username: 'Relief Cashier' }
            }]
        }]);
        mockFindAll
            .mockResolvedValueOnce([
                {
                    pos_transaction_id: 1,
                    invoice_number: 'INV-0001',
                    total_amount: '100.00',
                    payment_breakdown: [{ payment_type: 'cash', amount: 100 }],
                    cashier_id: 11,
                    shift_id: 31,
                    operator_session_id: 55,
                    created_at: '2026-09-05T09:30:00.000Z',
                    cashier: { user_id: 11, username: 'Relief Cashier' }
                },
                {
                    pos_transaction_id: 2,
                    invoice_number: 'INV-0002',
                    total_amount: '50.00',
                    payment_type: 'gcash',
                    cashier_id: 10,
                    shift_id: 31,
                    operator_session_id: null,
                    created_at: '2026-09-05T10:00:00.000Z',
                    cashier: { user_id: 10, username: 'Opening Cashier' }
                }
            ])
            .mockResolvedValueOnce([{
                pos_transaction_id: 3,
                invoice_number: 'INV-VOID-0003',
                total_amount: '20.00',
                shift_id: 31,
                voided_at: '2026-09-05T11:00:00.000Z'
            }]);
        mockAdjustmentFindAll.mockResolvedValue([
            { original_shift_id: 31, adjustment_type: 'cash_refund', status: 'succeeded', amount: '7.00' },
            { original_shift_id: 31, adjustment_type: 'external_refund', status: 'pending', amount: '4.00' }
        ]);

        const details = await posRepository.getZReadingSnapshotDetails({
            businessDate: '2026-09-05',
            startAt: new Date('2026-09-04T16:00:00.000Z'),
            endAt: new Date('2026-09-05T16:00:00.000Z'),
            locationId: 12
        });

        expect(details.branch_name).toBe('Main Branch');
        expect(details.receipt_ranges).toEqual(expect.objectContaining({
            sales: { beginning_invoice_number: 'INV-0001', ending_invoice_number: 'INV-0002' },
            voids: { beginning_invoice_number: 'INV-VOID-0003', ending_invoice_number: 'INV-VOID-0003' },
            returns: expect.objectContaining({ tracked: false })
        }));
        expect(details.refunds).toEqual(expect.objectContaining({
            succeeded_count: 1,
            succeeded_amount: 7,
            pending_count: 1,
            pending_amount: 4
        }));
        expect(details.shifts).toEqual([expect.objectContaining({
            shift_id: 31,
            transaction_count: 2,
            sales_amount: 150,
            opening_cashier: expect.objectContaining({ display_name: 'Opening Cashier' }),
            cash: {
                opening_float_amount: 100,
                expected_cash_amount: 130,
                counted_cash_amount: 125,
                variance_amount: -5
            },
            adjustments: expect.objectContaining({ void_transaction_count: 1, void_amount: 20 }),
            cashier_sales: expect.arrayContaining([
                expect.objectContaining({ display_name: 'Relief Cashier', attribution_type: 'operator_session', transaction_count: 1, sales_amount: 100 }),
                expect.objectContaining({ display_name: 'Opening Cashier', attribution_type: 'recorded_cashier', transaction_count: 1, sales_amount: 50 })
            ]),
            receipt_ranges: expect.objectContaining({ sales: { beginning_invoice_number: 'INV-0001', ending_invoice_number: 'INV-0002' } })
        })]);
    });
});
