import { describe, expect, it, jest } from '@jest/globals';
import { buildGetCashierShiftHistoryUseCase } from '../src/modules/pos/usecases/posUseCases.js';

describe('POS cashier shift history', () => {
    it('returns all active company branches for a master admin without accepting client cashier scope', async () => {
        const listCashierShiftHistory = jest.fn().mockResolvedValue({
            rows: [{
                pos_terminal_shift_id: 51,
                business_date: '2026-09-28',
                terminal_id: 'COUNTER-01',
                location_id: 9,
                cashier_id: 7,
                status: 'open',
                opened_at: '2026-09-28T01:00:00.000Z',
                cashEvents: [],
                location: { location_id: 9, name: 'Main Branch' },
                cashier: { user_id: 7, username: 'Branch Cashier' }
            }],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
        });
        const listActiveLocations = jest.fn().mockResolvedValue([
            { location_id: 9, name: 'Main Branch', is_active: true },
            { location_id: 12, name: 'Second Branch', is_active: true }
        ]);
        const useCase = buildGetCashierShiftHistoryUseCase({
            posRepository: {
                listCashierShiftHistory,
                getZReadingSummary: jest.fn().mockResolvedValue({
                    transaction_count: 0,
                    total_amount: 0,
                    payment_breakdown: []
                })
            },
            listActiveLocations
        });

        const result = await useCase({
            query: { cashier_id: 999, page: 1, limit: 20 },
            user: { user_id: 1, is_master_admin: true, username: 'Admin' }
        });

        expect(result.success).toBe(true);
        expect(listActiveLocations).toHaveBeenCalledWith({ locationIds: [] });
        expect(listCashierShiftHistory).toHaveBeenCalledWith(expect.objectContaining({
            locationId: null,
            locationIds: [9, 12],
            dateFrom: undefined,
            dateTo: undefined,
            status: 'all',
            page: 1,
            limit: 20
        }));
        expect(listCashierShiftHistory.mock.calls[0][0]).not.toHaveProperty('cashierId');
        expect(result.data.cashier).toBeNull();
        expect(result.data.history_scope).toEqual({
            mode: 'company',
            location_count: 2,
            label: 'All authorized company branches'
        });
        expect(result.data.records[0].shift.location_id).toBe(9);
    });

    it('constrains an admin location filter to one active company branch', async () => {
        const listCashierShiftHistory = jest.fn().mockResolvedValue({
            rows: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }
        });
        const listActiveLocations = jest.fn().mockResolvedValue([
            { location_id: 12, name: 'Second Branch', is_active: true }
        ]);
        const useCase = buildGetCashierShiftHistoryUseCase({
            posRepository: { listCashierShiftHistory },
            listActiveLocations
        });

        const result = await useCase({
            query: { location_id: 12 },
            user: {
                user_id: 1,
                permissions: ['pos:view', 'business_admin:branches:view_all']
            }
        });

        expect(result.success).toBe(true);
        expect(listActiveLocations).toHaveBeenCalledWith({ locationIds: [12] });
        expect(listCashierShiftHistory).toHaveBeenCalledWith(expect.objectContaining({
            locationId: 12,
            locationIds: [12]
        }));
        expect(result.data.history_scope).toEqual(expect.objectContaining({
            mode: 'company',
            location_count: 1
        }));
        expect(result.data.applied_filters.location_id).toBe(12);
    });

    it('fails closed when an admin has no active company locations', async () => {
        const listCashierShiftHistory = jest.fn();
        const useCase = buildGetCashierShiftHistoryUseCase({
            posRepository: { listCashierShiftHistory },
            listActiveLocations: jest.fn().mockResolvedValue([])
        });

        const result = await useCase({
            query: {},
            user: { user_id: 1, permissions: ['pos:view', 'business_admin:branches:view_all'] }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'POS_CASHIER_HISTORY_SCOPE_EMPTY'
        }));
        expect(listCashierShiftHistory).not.toHaveBeenCalled();
    });

    it('does not elevate branch-view capability into company-wide history', async () => {
        const listCashierShiftHistory = jest.fn().mockResolvedValue({
            rows: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }
        });
        const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 9 });
        const listActiveLocations = jest.fn();
        const useCase = buildGetCashierShiftHistoryUseCase({
            posRepository: { listCashierShiftHistory },
            resolveLocationScope,
            listActiveLocations
        });

        const result = await useCase({
            query: {},
            user: { user_id: 7, permissions: ['pos:view', 'pos:branch_view'] }
        });

        expect(result.success).toBe(true);
        expect(result.data.history_scope).toEqual(expect.objectContaining({ mode: 'own' }));
        expect(listActiveLocations).not.toHaveBeenCalled();
        expect(listCashierShiftHistory).toHaveBeenCalledWith(expect.objectContaining({
            cashierId: 7,
            locationId: 9
        }));
    });

    it('returns service unavailable when company scope resolution is not wired', async () => {
        const listCashierShiftHistory = jest.fn();
        const useCase = buildGetCashierShiftHistoryUseCase({
            posRepository: { listCashierShiftHistory }
        });

        const result = await useCase({
            query: {},
            user: { user_id: 1, is_master_admin: true }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(503);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'POS_CASHIER_HISTORY_SCOPE_UNAVAILABLE'
        }));
        expect(listCashierShiftHistory).not.toHaveBeenCalled();
    });

    it('always scopes history to the authenticated cashier and returns printable summaries', async () => {
        const listCashierShiftHistory = jest.fn().mockResolvedValue({
            rows: [{
                pos_terminal_shift_id: 44,
                business_date: '2026-08-15',
                terminal_id: 'COUNTER-01',
                location_id: 9,
                cashier_id: 7,
                status: 'closed',
                opened_at: '2026-08-15T01:00:00.000Z',
                closed_at: '2026-08-15T09:00:00.000Z',
                opening_float_amount: 1000,
                closing_cash_amount: 1450,
                cash_variance_amount: 0,
                cashEvents: [],
                cashier: { user_id: 7, username: 'Cashier One', email: 'cashier@example.com' },
                location: { location_id: 9, name: 'Main Branch' }
            }],
            pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
        });
        const getShiftCashSalesTotal = jest.fn().mockResolvedValue(450);
        const getZReadingSummary = jest.fn().mockResolvedValue({
            transaction_count: 3,
            total_amount: 450,
            payment_breakdown: [{ payment_type: 'cash', count: 3, amount: 450 }]
        });
        const useCase = buildGetCashierShiftHistoryUseCase({
            posRepository: {
                listCashierShiftHistory,
                getShiftCashSalesTotal,
                getZReadingSummary
            },
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 9 })
        });

        const result = await useCase({
            query: {
                cashier_id: 999,
                location_id: 9,
                date_from: '2026-08-15',
                date_to: '2026-08-15',
                page: 1,
                limit: 10
            },
            user: { user_id: 7, username: 'Cashier One', email: 'cashier@example.com' }
        });

        expect(result.success).toBe(true);
        expect(listCashierShiftHistory).toHaveBeenCalledWith({
            cashierId: 7,
            locationId: 9,
            dateFrom: '2026-08-15',
            dateTo: '2026-08-15',
            status: 'all',
            page: 1,
            limit: 10
        });
        expect(result.data.records).toHaveLength(1);
        expect(result.data.records[0]).toEqual(expect.objectContaining({
            cash_summary: expect.objectContaining({ cash_sales_amount: 450 }),
            sales_summary: expect.objectContaining({ total_amount: 450 })
        }));
        expect(result.data.cashier).toEqual({ cashier_id: 7, cashier_name: 'Cashier One' });
    });

    it('derives cash reconciliation from the same sales summary as transactions and payment methods', async () => {
        const listCashierShiftHistory = jest.fn().mockResolvedValue({
            rows: [{
                pos_terminal_shift_id: 45,
                business_date: '2026-08-15',
                terminal_id: 'COUNTER-01',
                location_id: 9,
                cashier_id: 7,
                status: 'open',
                opened_at: '2026-08-15T01:00:00.000Z',
                closed_at: null,
                opening_float_amount: 1000,
                closing_cash_amount: null,
                cash_variance_amount: null,
                cashEvents: []
            }],
            pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
        });
        const getShiftCashSalesTotal = jest.fn().mockResolvedValue(999);
        const getZReadingSummary = jest.fn().mockResolvedValue({
            transaction_count: 1,
            total_amount: 123,
            payment_breakdown: [{ payment_type: 'cash', count: 1, amount: 123 }]
        });
        const useCase = buildGetCashierShiftHistoryUseCase({
            posRepository: {
                listCashierShiftHistory,
                getShiftCashSalesTotal,
                getZReadingSummary
            },
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 9 })
        });

        const result = await useCase({
            query: { date_from: '2026-08-15', date_to: '2026-08-15' },
            user: { user_id: 7, username: 'Cashier One' }
        });

        expect(result.success).toBe(true);
        expect(result.data.records[0].sales_summary).toEqual(expect.objectContaining({
            transaction_count: 1,
            total_amount: 123
        }));
        expect(result.data.records[0].cash_summary).toEqual(expect.objectContaining({
            cash_sales_amount: 123,
            expected_cash_amount: 1123,
            closing_cash_amount: null,
            cash_variance_amount: null
        }));
        expect(getShiftCashSalesTotal).not.toHaveBeenCalled();
    });

    it('shows an administrator void made after close as a post-close cashier-history adjustment', async () => {
        const listCashierShiftHistory = jest.fn().mockResolvedValue({
            rows: [{
                pos_terminal_shift_id: 46,
                business_date: '2026-08-15',
                terminal_id: 'COUNTER-01',
                location_id: 9,
                cashier_id: 7,
                status: 'closed',
                opened_at: '2026-08-15T01:00:00.000Z',
                closed_at: '2026-08-15T09:00:00.000Z',
                opening_float_amount: 1000,
                closing_cash_amount: 1450,
                cash_variance_amount: 0,
                cashEvents: []
            }],
            pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
        });
        const getZReadingSummary = jest.fn().mockResolvedValue({
            transaction_count: 3,
            total_amount: 450,
            void_transaction_count: 0,
            void_amount: 0,
            voided_item_count: 0,
            payment_breakdown: [{ payment_type: 'cash', count: 3, amount: 450 }]
        });
        const getPostCloseVoidSummaryForShift = jest.fn().mockResolvedValue({
            post_close_void_transaction_count: 1,
            post_close_void_amount: 125,
            post_close_voided_item_count: 1
        });
        const getPostCloseAdjustmentSummaryForShift = jest.fn().mockResolvedValue({
            post_close_adjustment_count: 1,
            post_close_refund_amount: 125,
            post_close_pending_amount: 0,
            post_close_manual_review_amount: 0,
            post_close_adjustments: [{
                adjustment_reference: 'PRA-46',
                original_cashier_id: 7,
                actor_user_id: 1,
                actor_name: 'Admin One',
                actor_shift_id: null,
                status: 'succeeded',
                amount: 125
            }]
        });
        const useCase = buildGetCashierShiftHistoryUseCase({
            posRepository: {
                listCashierShiftHistory,
                getZReadingSummary,
                getPostCloseVoidSummaryForShift,
                getPostCloseAdjustmentSummaryForShift
            },
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 9 })
        });

        const result = await useCase({
            query: { date_from: '2026-08-15', date_to: '2026-08-15' },
            user: { user_id: 7, username: 'Cashier One' }
        });

        expect(result.success).toBe(true);
        expect(getPostCloseVoidSummaryForShift).toHaveBeenCalledWith({
            shiftId: 46,
            closedAt: '2026-08-15T09:00:00.000Z',
            terminalId: 'COUNTER-01',
            locationId: 9
        });
        expect(result.data.records[0].sales_summary).toEqual(expect.objectContaining({
            void_transaction_count: 1,
            void_amount: 125,
            post_close_void_transaction_count: 1,
            post_close_void_amount: 125,
            post_close_adjustment_count: 1,
            post_close_refund_amount: 125,
            post_close_adjustments: [expect.objectContaining({
                actor_name: 'Admin One',
                actor_shift_id: null
            })]
        }));
    });
});
