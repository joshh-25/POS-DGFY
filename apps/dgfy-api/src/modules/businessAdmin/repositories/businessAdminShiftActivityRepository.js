import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const REFUND_ADJUSTMENT_TYPES = ['cash_refund', 'external_refund', 'provider_refund'];

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const emptyActivity = () => ({
    orders_processed: 0,
    refunds_amount: 0,
    discounts_amount: 0,
    void_count: 0
});

const normalizeShiftIds = (shiftIds = []) => [...new Set(
    (Array.isArray(shiftIds) ? shiftIds : [shiftIds])
        .map((shiftId) => Number(shiftId))
        .filter((shiftId) => Number.isInteger(shiftId))
)];

/**
 * Shared shift-grain activity projection used by read-only Business Admin views.
 *
 * The status/count/refund rules intentionally mirror the pre-existing Overview
 * and Shift History outputs. This module owns the query and aggregation so new
 * consumers do not create a second financial interpretation of a shift.
 */
export const businessAdminShiftActivityRepository = {
    async getByShiftIds(shiftIds = []) {
        const normalizedShiftIds = normalizeShiftIds(shiftIds);
        const activityByShift = new Map(normalizedShiftIds.map((shiftId) => [shiftId, emptyActivity()]));
        if (normalizedShiftIds.length === 0) return activityByShift;

        const PosTransaction = dbStore.get('PosTransaction');
        const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
        const transactions = await PosTransaction.findAll({
            where: { shift_id: { [Op.in]: normalizedShiftIds } },
            attributes: ['pos_transaction_id', 'shift_id', 'status', 'discount_amount'],
            raw: true
        });
        const transactionShiftById = new Map();

        transactions.forEach((transaction) => {
            const shiftId = Number(transaction.shift_id);
            const activity = activityByShift.get(shiftId);
            if (!activity) return;
            transactionShiftById.set(Number(transaction.pos_transaction_id), shiftId);
            activity.orders_processed += 1;
            activity.discounts_amount += toNumber(transaction.discount_amount);
            if (String(transaction.status).toLowerCase() === 'voided') activity.void_count += 1;
        });

        if (PosTransactionAdjustment && transactionShiftById.size > 0) {
            const refunds = await PosTransactionAdjustment.findAll({
                where: {
                    pos_transaction_id: { [Op.in]: Array.from(transactionShiftById.keys()) },
                    adjustment_type: { [Op.in]: REFUND_ADJUSTMENT_TYPES },
                    status: 'succeeded'
                },
                attributes: ['pos_transaction_id', 'amount'],
                raw: true
            });
            refunds.forEach((refund) => {
                const activity = activityByShift.get(transactionShiftById.get(Number(refund.pos_transaction_id)));
                if (activity) activity.refunds_amount += toNumber(refund.amount);
            });
        }

        return activityByShift;
    }
};

export { emptyActivity, normalizeShiftIds, REFUND_ADJUSTMENT_TYPES };
