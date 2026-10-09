import { Op } from 'sequelize';
import { TenantIntakeProposal, PlatformAdminAuditLog } from '../../../models/index.js';

const plain = (row) => row?.get ? row.get({ plain: true }) : row;

export const tenantIntakeRepository = {
    transaction: (callback) => TenantIntakeProposal.sequelize.transaction(callback),
    create: async (values, transaction) => plain(await TenantIntakeProposal.create(values, { transaction })),
    get: async (id) => plain(await TenantIntakeProposal.findByPk(id)),
    list: async ({ status, limit = 50 }) => {
        const where = status === 'expired'
            ? { [Op.or]: [{ status: 'expired' }, { status: 'pending', expires_at: { [Op.lte]: new Date() } }] }
            : status === 'pending' ? { status, expires_at: { [Op.gt]: new Date() } } : status ? { status } : {};
        return (await TenantIntakeProposal.findAll({ where, limit, order: [['createdAt', 'DESC']] })).map(plain);
    },
    // All edits, rejection and claiming serialize on the same landlord row lock.
    mutate: (id, callback) => TenantIntakeProposal.sequelize.transaction(async (transaction) => {
        const row = await TenantIntakeProposal.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        return callback(plain(row), async (patch) => plain(await row.update(patch, { transaction })), transaction);
    }),
    audit: (values, transaction) => PlatformAdminAuditLog.create(values, { transaction })
};
