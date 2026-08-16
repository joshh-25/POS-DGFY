import { describe, expect, it, jest } from '@jest/globals';
import { buildGetCashierShiftHistoryUseCase } from '../src/modules/pos/usecases/posUseCases.js';

describe('POS cashier shift history', () => {
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
});
