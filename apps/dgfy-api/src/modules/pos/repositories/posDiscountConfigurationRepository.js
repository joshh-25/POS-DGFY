import { Op, col, fn, where as sequelizeWhere } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => {
    if (!value) return null;
    if (typeof value.get === 'function') return value.get({ plain: true });
    if (typeof value.toJSON === 'function') return value.toJSON();
    return { ...value };
};

const lockOptions = (transaction, lock) => (
    transaction && lock ? { lock: transaction.LOCK.UPDATE } : {}
);

const getModel = (name) => dbStore.get(name);

export const posDiscountConfigurationRepository = Object.freeze({
    async list({ transaction } = {}) {
        const PosDiscountRule = getModel('PosDiscountRule');
        const rows = await PosDiscountRule.findAll({
            order: [
                ['is_active', 'DESC'],
                ['is_approved', 'DESC'],
                ['name', 'ASC'],
                ['id', 'ASC']
            ],
            transaction
        });
        return rows.map(toPlain);
    },

    async listAvailable({ transaction } = {}) {
        const PosDiscountRule = getModel('PosDiscountRule');
        const rows = await PosDiscountRule.findAll({
            where: {
                is_active: true,
                is_approved: true
            },
            order: [['name', 'ASC'], ['id', 'ASC']],
            transaction
        });
        return rows.map(toPlain);
    },

    async findById(id, { transaction, lock = false } = {}) {
        const PosDiscountRule = getModel('PosDiscountRule');
        const row = await PosDiscountRule.findByPk(id, {
            transaction,
            ...lockOptions(transaction, lock)
        });
        return toPlain(row);
    },

    async findByName(name, { excludeId = null, transaction, lock = false } = {}) {
        const PosDiscountRule = getModel('PosDiscountRule');
        const normalizedName = String(name || '').trim().toLowerCase();
        const predicates = [sequelizeWhere(fn('LOWER', col('name')), normalizedName)];
        const normalizedExcludeId = Number.parseInt(excludeId, 10);
        if (Number.isInteger(normalizedExcludeId) && normalizedExcludeId > 0) {
            predicates.push({ id: { [Op.ne]: normalizedExcludeId } });
        }

        const row = await PosDiscountRule.findOne({
            where: { [Op.and]: predicates },
            order: [['id', 'ASC']],
            transaction,
            ...lockOptions(transaction, lock)
        });
        return toPlain(row);
    },

    async create(payload, { transaction } = {}) {
        const PosDiscountRule = getModel('PosDiscountRule');
        const row = await PosDiscountRule.create(payload, { transaction });
        return toPlain(row);
    },

    async updateById(id, payload, { transaction, lock = false } = {}) {
        const PosDiscountRule = getModel('PosDiscountRule');
        const row = await PosDiscountRule.findByPk(id, {
            transaction,
            ...lockOptions(transaction, lock)
        });
        if (!row) return null;

        await row.update(payload, { transaction });
        return toPlain(row);
    },

    async countTransactionReferences(discountRuleId, { transaction } = {}) {
        const PosTransactionDiscount = getModel('PosTransactionDiscount');
        return PosTransactionDiscount.count({
            where: { discount_rule_id: discountRuleId },
            transaction
        });
    },

    async deleteById(id, { transaction, lock = false } = {}) {
        const PosDiscountRule = getModel('PosDiscountRule');
        const row = await PosDiscountRule.findByPk(id, {
            transaction,
            ...lockOptions(transaction, lock)
        });
        if (!row) return null;

        await row.destroy({ transaction });
        return toPlain(row);
    },

    async createAuditLog(payload, { transaction } = {}) {
        const AuditLog = getModel('AuditLog');
        if (!AuditLog?.create) throw new Error('Tenant audit log model is unavailable');
        return AuditLog.create(payload, { transaction });
    }
});

export default posDiscountConfigurationRepository;
