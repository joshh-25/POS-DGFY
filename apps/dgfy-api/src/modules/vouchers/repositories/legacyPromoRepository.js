// #2159: tenant-scoped persistence for the transitional Legacy Promos surface. Every model is
// resolved through `dbStore.get(...)` -- see voucherRepository.js's header for why a static model
// import would bind to the wrong database the moment a request carries a tenant context.
//
// This repository deliberately owns ONLY the two legacy setting rows plus audit evidence. It is not
// a generic settings writer: generic settings writes blindly replace a whole JSON value, which is
// exactly the clobber failure mode revocation has to avoid against a concurrent checkout counter
// increment.

import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => (value && typeof value.get === 'function' ? value.get({ plain: true }) : value);

export const legacyPromoRepository = {
    async beginTransaction() {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        return sequelize.transaction();
    },

    async findSettingByKey(key, options = {}) {
        const SystemSetting = dbStore.get('SystemSetting');
        const row = await SystemSetting.findOne({
            where: { setting_key: key },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findSettingsByKeys(keys = [], options = {}) {
        const SystemSetting = dbStore.get('SystemSetting');
        const rows = await SystemSetting.findAll({
            where: { setting_key: { [Op.in]: keys } },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async updateSettingValueByKey(key, value, options = {}) {
        const SystemSetting = dbStore.get('SystemSetting');
        const row = await SystemSetting.findOne({
            where: { setting_key: key },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update({
            setting_value: JSON.stringify(value),
            data_type: 'json'
        }, { transaction: options.transaction });
        return toPlain(row);
    },

    async createAuditLog(payload = {}, options = {}) {
        const AuditLog = dbStore.get('AuditLog');
        if (!AuditLog) {
            throw new Error('AuditLog model is unavailable');
        }
        const created = await AuditLog.create(payload, { transaction: options.transaction });
        return toPlain(created);
    }
};
