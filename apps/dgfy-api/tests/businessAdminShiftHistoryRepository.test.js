import { describe, expect, it, jest } from '@jest/globals';
import { Op } from 'sequelize';

const findAndCountAll = jest.fn();
const cashDrawerEventFindAll = jest.fn();
const transactionFindAll = jest.fn();
const getByShiftIds = jest.fn();

const shiftModel = { findAndCountAll };
const cashDrawerEventModel = { findAll: cashDrawerEventFindAll };
const transactionModel = { findAll: transactionFindAll };
const userModel = {};
const locationModel = {};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((name) => ({
            PosTerminalShift: shiftModel,
            PosCashDrawerEvent: cashDrawerEventModel,
            PosTransaction: transactionModel,
            User: userModel,
            TenantLocation: locationModel
        }[name] || null))
    }
}));

jest.unstable_mockModule('../src/modules/businessAdmin/repositories/businessAdminShiftActivityRepository.js', () => ({
    businessAdminShiftActivityRepository: { getByShiftIds }
}));

let businessAdminShiftHistoryRepository;

beforeAll(async () => {
    ({ businessAdminShiftHistoryRepository } = await import('../src/modules/businessAdmin/repositories/businessAdminShiftHistoryRepository.js'));
});
beforeEach(() => {
    findAndCountAll.mockReset();
    cashDrawerEventFindAll.mockReset();
    transactionFindAll.mockReset();
    getByShiftIds.mockReset();
    getByShiftIds.mockResolvedValue(new Map([[41, { orders_processed: 1 }]]));
    cashDrawerEventFindAll.mockResolvedValue([
        {
            pos_cash_drawer_event_id: 1,
            pos_terminal_shift_id: 41,
            event_type: 'cash_in',
            amount: 20,
            reason: 'Petty cash top-up',
            recorded_by: 7,
            created_at: '2026-10-15T08:10:00.000Z'
        },
        {
            pos_cash_drawer_event_id: 2,
            pos_terminal_shift_id: 41,
            event_type: 'cash_out',
            amount: 30,
            reason: 'Supplier change',
            recorded_by: 7,
            created_at: '2026-10-15T08:20:00.000Z'
        }
    ]);
    transactionFindAll.mockResolvedValue([
        {
            shift_id: 41,
            payment_type: 'gcash',
            total_amount: 300,
            payment_breakdown: [
                { payment_type: 'gcash', amount: 200 },
                { payment_type: 'cash', amount: 100 }
            ]
        },
        {
            shift_id: 41,
            payment_type: 'cash',
            total_amount: 75,
            payment_breakdown: null
        }
    ]);
    findAndCountAll.mockResolvedValue({
        rows: [{
            pos_terminal_shift_id: 41,
            terminal_id: 'COUNTER-01',
            location_id: 4,
            status: 'open',
            opening_float_amount: 1000,
            expected_cash_amount: 1000,
            cashier: { user_id: 7, username: 'Cashier' },
            location: { location_id: 4, name: 'Main Branch' }
        }],
        count: 1
    });
});
describe('Business Admin shift cash projection', () => {
    it('projects the live POS drawer total instead of the stale stored expected amount', async () => {
        const result = await businessAdminShiftHistoryRepository.listShifts({
            allowedLocationIds: null,
            filters: { page: 1, limit: 100, status: 'open' }
        });

        expect(transactionFindAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                shift_id: { [Op.in]: [41] },
                status: 'completed'
            }),
            attributes: ['shift_id', 'payment_type', 'total_amount', 'payment_breakdown'],
            raw: true
        }));
        expect(result.shifts[0]).toEqual(expect.objectContaining({
            opening_cash_amount: 1000,
            cash_sales_amount: 175,
            cash_in_amount: 20,
            cash_out_amount: 30,
            expected_cash_amount: 1165
        }));
    });
});
