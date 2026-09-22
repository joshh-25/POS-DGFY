import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const buildWhere = ({ dateFrom = '', dateTo = '', branchId = null, allowedLocationIds = null, status = '', search = '' } = {}) => {
    const where = {};
    if (dateFrom || dateTo) {
        where.expense_date = {
            ...(dateFrom ? { [Op.gte]: dateFrom } : {}),
            ...(dateTo ? { [Op.lte]: dateTo } : {})
        };
    }
    if (branchId) {
        where.location_id = branchId;
    } else if (Array.isArray(allowedLocationIds)) {
        where.location_id = { [Op.in]: allowedLocationIds };
    }
    if (status) where.status = status;
    if (search) {
        where[Op.or] = [
            { description: { [Op.like]: `%${search}%` } },
            { category: { [Op.like]: `%${search}%` } },
            { vendor_name: { [Op.like]: `%${search}%` } },
            { reference: { [Op.like]: `%${search}%` } }
        ];
    }
    return where;
};

const toExpenseRow = (value) => {
    const row = toPlain(value) || {};
    return {
        expense_id: row.business_admin_expense_id,
        expense_date: row.expense_date,
        location_id: row.location_id || null,
        branch_name: row.location?.name || row.location_name_snapshot || (row.location_id ? `Branch #${row.location_id}` : 'Company-wide'),
        category: row.category,
        description: row.description,
        amount: toNumber(row.amount),
        currency: row.currency || 'PHP',
        payment_method: row.payment_method,
        vendor_name: row.vendor_name || '',
        reference: row.reference || '',
        notes: row.notes || '',
        status: row.status,
        created_at: row.created_at,
        created_by: row.created_by,
        created_by_name: row.createdByUser?.username || row.createdByUser?.email || 'Unknown',
        voided_at: row.voided_at || null,
        voided_by: row.voided_by || null,
        voided_by_name: row.voidedByUser?.username || row.voidedByUser?.email || null,
        void_reason: row.void_reason || null
    };
};

const include = () => {
    const User = dbStore.get('User');
    const TenantLocation = dbStore.get('TenantLocation');
    return [
        { model: User, as: 'createdByUser', attributes: ['user_id', 'username', 'email'], required: false },
        { model: User, as: 'voidedByUser', attributes: ['user_id', 'username', 'email'], required: false },
        { model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false }
    ];
};

export const businessAdminExpenseRepository = {
    async list({ filters = {} } = {}) {
        const BusinessAdminExpense = dbStore.get('BusinessAdminExpense');
        const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
        const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || 20, 1), 100);
        const { rows, count } = await BusinessAdminExpense.findAndCountAll({
            where: buildWhere(filters),
            include: include(),
            order: [['expense_date', 'DESC'], ['business_admin_expense_id', 'DESC']],
            limit,
            offset: (page - 1) * limit,
            distinct: true
        });
        return {
            expenses: rows.map(toExpenseRow),
            pagination: {
                page,
                limit,
                total: count,
                total_pages: Math.ceil(count / limit)
            }
        };
    },

    async getSummary({ filters = {} } = {}) {
        const BusinessAdminExpense = dbStore.get('BusinessAdminExpense');
        const sequelize = BusinessAdminExpense.sequelize;
        const [row] = await BusinessAdminExpense.findAll({
            where: buildWhere(filters),
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('business_admin_expense_id')), 'entry_count'],
                [sequelize.literal('COALESCE(SUM(`amount`), 0)'), 'total_amount'],
                [sequelize.literal("COALESCE(SUM(CASE WHEN `status` = 'posted' THEN `amount` ELSE 0 END), 0)"), 'posted_amount'],
                [sequelize.literal("COALESCE(SUM(CASE WHEN `status` = 'voided' THEN `amount` ELSE 0 END), 0)"), 'voided_amount'],
                [sequelize.literal("SUM(CASE WHEN `status` = 'posted' THEN 1 ELSE 0 END)"), 'posted_entries'],
                [sequelize.literal("SUM(CASE WHEN `status` = 'voided' THEN 1 ELSE 0 END)"), 'voided_entries']
            ],
            raw: true
        });
        return {
            entry_count: Number(row?.entry_count || 0),
            total_amount: toNumber(row?.total_amount),
            posted_amount: toNumber(row?.posted_amount),
            voided_amount: toNumber(row?.voided_amount),
            posted_entries: Number(row?.posted_entries || 0),
            voided_entries: Number(row?.voided_entries || 0)
        };
    },

    async findById({ expenseId }) {
        const BusinessAdminExpense = dbStore.get('BusinessAdminExpense');
        const row = await BusinessAdminExpense.findOne({
            where: { business_admin_expense_id: expenseId },
            include: include()
        });
        return row ? toExpenseRow(row) : null;
    },

    async findRawById({ expenseId }) {
        const BusinessAdminExpense = dbStore.get('BusinessAdminExpense');
        return BusinessAdminExpense.findOne({ where: { business_admin_expense_id: expenseId } });
    },

    async findByIdempotencyKey({ idempotencyKey }) {
        const BusinessAdminExpense = dbStore.get('BusinessAdminExpense');
        const row = await BusinessAdminExpense.findOne({
            where: { idempotency_key: idempotencyKey },
            include: include()
        });
        return row ? toExpenseRow(row) : null;
    },

    async create({ values }) {
        const BusinessAdminExpense = dbStore.get('BusinessAdminExpense');
        const row = await BusinessAdminExpense.create(values);
        return toExpenseRow(row);
    },

    async voidPosted({ expenseId, voidedBy, voidReason }) {
        const BusinessAdminExpense = dbStore.get('BusinessAdminExpense');
        const [updated] = await BusinessAdminExpense.update(
            {
                status: 'voided',
                voided_by: voidedBy,
                voided_at: new Date(),
                void_reason: voidReason
            },
            {
                where: {
                    business_admin_expense_id: expenseId,
                    status: 'posted'
                }
            }
        );
        if (!updated) return null;
        return this.findById({ expenseId });
    },

    async appendAudit({ user, expense, action, eventType, changes, reason = null, auditContext = {} }) {
        const AuditLog = dbStore.get('AuditLog');
        await AuditLog.create({
            user_id: user?.user_id || null,
            entity_type: 'business_admin_expense',
            entity_id: expense?.expense_id || expense?.business_admin_expense_id || null,
            action,
            event_type: eventType,
            actor_username: user?.username || user?.email || null,
            location_id: expense?.location_id || null,
            reason,
            changes,
            effective_role: auditContext.effectiveRole || null,
            request_id: auditContext.requestId || null,
            trace_id: auditContext.traceId || null,
            outcome: 'success',
            ip_address: auditContext.ipAddress || null,
            user_agent: auditContext.userAgent || null
        });
    }
};

export { buildWhere as buildBusinessAdminExpenseWhere };
