import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);
const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const OVERDUE_SHIFT_MS = 12 * 60 * 60 * 1000;

const buildLocationWhere = ({ branchId = null, allowedLocationIds = null } = {}) => {
    if (branchId) return branchId;
    if (Array.isArray(allowedLocationIds)) return { [Op.in]: allowedLocationIds };
    return undefined;
};

export const businessAdminWorkforceRepository = {
    async getWorkforce({ startAt, endAt, branchId = null, allowedLocationIds = null } = {}) {
        const User = dbStore.get('User');
        const UserLocationGrant = dbStore.get('UserLocationGrant');
        const TenantLocation = dbStore.get('TenantLocation');
        const PosTransaction = dbStore.get('PosTransaction');
        const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
        const PosTerminalShift = dbStore.get('PosTerminalShift');

        const scopeLocationIds = branchId
            ? [branchId]
            : (Array.isArray(allowedLocationIds) ? allowedLocationIds : null);
        const locationIdWhere = buildLocationWhere({ branchId, allowedLocationIds });
        const grants = await UserLocationGrant.findAll({
            where: locationIdWhere ? { location_id: locationIdWhere } : {},
            include: [{ model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false }]
        });
        const grantedUserIds = [...new Set(grants.map((grant) => Number(grant.user_id)).filter((userId) => userId > 0))];
        const users = await User.findAll({
            where: {
                deleted_at: null,
                // Branch-scoped viewers may see only employees assigned to one of
                // their authorized branches. Tenant-wide owners retain the full directory.
                ...(Array.isArray(scopeLocationIds) ? { user_id: { [Op.in]: grantedUserIds.length > 0 ? grantedUserIds : [0] } } : {})
            },
            attributes: ['user_id', 'username', 'email', 'role', 'role_preset_key', 'is_active', 'invitation_status', 'last_login'],
            order: [['username', 'ASC'], ['user_id', 'ASC']],
            raw: true
        });
        const userIds = users.map((user) => Number(user.user_id)).filter((userId) => userId > 0);

        const transactionWhere = {
            cashier_id: { [Op.in]: userIds.length > 0 ? userIds : [0] },
            created_at: { [Op.between]: [startAt, endAt] },
            status: { [Op.in]: ['completed', 'voided'] },
            ...(locationIdWhere ? { location_id: locationIdWhere } : {})
        };
        const transactions = await PosTransaction.findAll({
            where: transactionWhere,
            attributes: ['pos_transaction_id', 'cashier_id', 'status', 'total_amount', 'discount_amount'],
            raw: true
        });
        const transactionToCashier = new Map();
        const performanceByUser = new Map(userIds.map((userId) => [userId, {
            orders_processed: 0,
            completed_sales_amount: 0,
            discounts_amount: 0,
            void_count: 0,
            refunds_amount: 0,
            cash_difference_amount: 0,
            open_shift_count: 0,
            overdue_open_shift_count: 0
        }]));
        transactions.forEach((transaction) => {
            const userId = Number(transaction.cashier_id);
            const performance = performanceByUser.get(userId);
            if (!performance) return;
            transactionToCashier.set(Number(transaction.pos_transaction_id), userId);
            performance.orders_processed += 1;
            performance.discounts_amount += toNumber(transaction.discount_amount);
            if (String(transaction.status).toLowerCase() === 'voided') {
                performance.void_count += 1;
            } else {
                performance.completed_sales_amount += toNumber(transaction.total_amount);
            }
        });
        if (PosTransactionAdjustment && transactionToCashier.size > 0) {
            const refunds = await PosTransactionAdjustment.findAll({
                where: {
                    pos_transaction_id: { [Op.in]: Array.from(transactionToCashier.keys()) },
                    adjustment_type: { [Op.in]: ['cash_refund', 'external_refund', 'provider_refund'] },
                    status: 'succeeded'
                },
                attributes: ['pos_transaction_id', 'amount'],
                raw: true
            });
            refunds.forEach((refund) => {
                const performance = performanceByUser.get(transactionToCashier.get(Number(refund.pos_transaction_id)));
                if (performance) performance.refunds_amount += toNumber(refund.amount);
            });
        }

        const shiftWhere = {
            cashier_id: { [Op.in]: userIds.length > 0 ? userIds : [0] },
            ...(locationIdWhere ? { location_id: locationIdWhere } : {}),
            [Op.or]: [
                { opened_at: { [Op.between]: [startAt, endAt] } },
                { status: 'open' }
            ]
        };
        const shifts = await PosTerminalShift.findAll({
            where: shiftWhere,
            attributes: ['cashier_id', 'status', 'opened_at', 'cash_variance_amount'],
            raw: true
        });
        const overdueBoundary = Date.now() - OVERDUE_SHIFT_MS;
        shifts.forEach((shift) => {
            const performance = performanceByUser.get(Number(shift.cashier_id));
            if (!performance) return;
            performance.cash_difference_amount += Math.abs(toNumber(shift.cash_variance_amount));
            if (shift.status === 'open') {
                performance.open_shift_count += 1;
                if (shift.opened_at && new Date(shift.opened_at).getTime() <= overdueBoundary) {
                    performance.overdue_open_shift_count += 1;
                }
            }
        });

        const grantsByUser = new Map();
        grants.map(toPlain).forEach((grant) => {
            const userId = Number(grant.user_id);
            const entries = grantsByUser.get(userId) || [];
            entries.push({
                location_id: Number(grant.location_id),
                name: grant.location?.name || `Branch ${grant.location_id}`
            });
            grantsByUser.set(userId, entries);
        });

        return users.map((user) => {
            const userId = Number(user.user_id);
            const performance = performanceByUser.get(userId) || {};
            const indicators = [];
            if (performance.cash_difference_amount > 0) indicators.push({ code: 'CASH_VARIANCE', severity: 'warning', label: 'Cash variance requires review' });
            if (performance.void_count > 0) indicators.push({ code: 'VOID_ACTIVITY', severity: 'info', label: 'Voided transactions recorded' });
            if (performance.discounts_amount > 0) indicators.push({ code: 'DISCOUNT_ACTIVITY', severity: 'info', label: 'Discount activity recorded' });
            if (performance.overdue_open_shift_count > 0) indicators.push({ code: 'OVERDUE_SHIFT', severity: 'warning', label: 'Open shift exceeds 12 hours' });
            return {
                user_id: userId,
                username: user.username,
                email: user.email,
                role: user.role,
                role_preset_key: user.role_preset_key || null,
                is_active: user.is_active !== false && user.is_active !== 0,
                invitation_status: user.invitation_status || 'accepted',
                last_login: user.last_login || null,
                branch_assignments: grantsByUser.get(userId) || [],
                performance,
                review_indicators: indicators
            };
        });
    }
};
