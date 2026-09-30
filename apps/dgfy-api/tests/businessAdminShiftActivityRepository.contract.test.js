import { describe, expect, it, jest } from '@jest/globals';
import { Op } from 'sequelize';

const transactionFindAll = jest.fn();
const adjustmentFindAll = jest.fn();
const transactionModel = { findAll: transactionFindAll };
const adjustmentModel = { findAll: adjustmentFindAll };

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((name) => {
            if (name === 'PosTransaction') return transactionModel;
            if (name === 'PosTransactionAdjustment') return adjustmentModel;
            return null;
        })
    }
}));

let businessAdminShiftActivityRepository;

beforeAll(async () => {
    ({ businessAdminShiftActivityRepository } = await import('../src/modules/businessAdmin/repositories/businessAdminShiftActivityRepository.js'));
});

beforeEach(() => {
    transactionFindAll.mockReset();
    adjustmentFindAll.mockReset();
});

describe('Business Admin shared shift activity projection', () => {
    it('characterizes orders, discounts, voids, successful partial refunds, and mixed tenders per shift', async () => {
        transactionFindAll.mockResolvedValue([
            { pos_transaction_id: 1001, shift_id: 101, status: 'completed', discount_amount: 10, payment_type: 'cash', payment_breakdown: [{ payment_type: 'cash', amount: 90 }] },
            { pos_transaction_id: 1002, shift_id: 101, status: 'voided', discount_amount: 5, payment_type: 'card', payment_breakdown: [{ payment_type: 'card', amount: 45 }] },
            { pos_transaction_id: 1003, shift_id: 101, status: 'completed', payment_status: 'partial_refunded', discount_amount: null, payment_type: 'gcash', payment_breakdown: [{ payment_type: 'gcash', amount: 80 }, { payment_type: 'cash', amount: 20 }] },
            { pos_transaction_id: 1004, shift_id: 102, status: 'completed', discount_amount: 2, payment_type: 'cash', payment_breakdown: [{ payment_type: 'cash', amount: 48 }] },
            { pos_transaction_id: 1999, shift_id: 999, status: 'completed', discount_amount: 100 }
        ]);
        adjustmentFindAll.mockResolvedValue([
            { pos_transaction_id: 1001, amount: 12 },
            { pos_transaction_id: 1003, amount: 8 },
            { pos_transaction_id: 1004, amount: 4 }
        ]);

        const activityByShift = await businessAdminShiftActivityRepository.getByShiftIds([101, 101, 102]);

        expect(transactionFindAll).toHaveBeenCalledWith({
            where: { shift_id: { [Op.in]: [101, 102] } },
            attributes: ['pos_transaction_id', 'shift_id', 'status', 'discount_amount'],
            raw: true
        });
        expect(adjustmentFindAll).toHaveBeenCalledWith({
            where: {
                pos_transaction_id: { [Op.in]: [1001, 1002, 1003, 1004] },
                adjustment_type: { [Op.in]: ['cash_refund', 'external_refund', 'provider_refund'] },
                status: 'succeeded'
            },
            attributes: ['pos_transaction_id', 'amount'],
            raw: true
        });
        expect(Object.fromEntries(activityByShift)).toEqual({
            101: { orders_processed: 3, refunds_amount: 20, discounts_amount: 15, void_count: 1 },
            102: { orders_processed: 1, refunds_amount: 4, discounts_amount: 2, void_count: 0 }
        });
    });

    it('returns zeroed projections without querying transaction tables when no shifts are selected', async () => {
        const activityByShift = await businessAdminShiftActivityRepository.getByShiftIds([]);

        expect(Object.fromEntries(activityByShift)).toEqual({});
        expect(transactionFindAll).not.toHaveBeenCalled();
        expect(adjustmentFindAll).not.toHaveBeenCalled();
    });
});
