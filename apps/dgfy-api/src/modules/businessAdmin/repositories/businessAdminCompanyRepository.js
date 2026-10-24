import dbStore from '../../../utils/dbStore.js';

const POS_BUSINESS_NAME_SETTING_KEY = 'pos_business_name';
const POS_BUSINESS_NAME_SETTING_DESCRIPTION = 'Business name used by POS and tenant-facing receipts.';

const getTenantModel = () => dbStore.get('Tenant');
const getTenantAdminAuditLogModel = () => dbStore.get('TenantAdminAuditLog');
const getSystemSettingModel = () => dbStore.get('SystemSetting');

const readPosBusinessName = async ({ SystemSetting, transaction }) => {
    const setting = await SystemSetting.findOne({
        where: { setting_key: POS_BUSINESS_NAME_SETTING_KEY },
        transaction,
        ...(transaction?.LOCK ? { lock: transaction.LOCK.UPDATE } : {})
    });

    return {
        exists: Boolean(setting),
        value: setting ? String(setting.setting_value ?? '') : null,
        dataType: setting?.data_type || 'string',
        description: setting?.description ?? POS_BUSINESS_NAME_SETTING_DESCRIPTION
    };
};

const updatePosBusinessName = async ({ SystemSetting, name }) => (
    SystemSetting.sequelize.transaction(async (transaction) => {
        const snapshot = await readPosBusinessName({ SystemSetting, transaction });
        if (snapshot.exists && snapshot.value === name) {
            return { snapshot, changed: false };
        }

        const setting = await SystemSetting.findOne({
            where: { setting_key: POS_BUSINESS_NAME_SETTING_KEY },
            transaction,
            ...(transaction?.LOCK ? { lock: transaction.LOCK.UPDATE } : {})
        });

        if (setting) {
            await setting.update({ setting_value: name }, { transaction });
        } else {
            await SystemSetting.create({
                setting_key: POS_BUSINESS_NAME_SETTING_KEY,
                setting_value: name,
                data_type: 'string',
                description: POS_BUSINESS_NAME_SETTING_DESCRIPTION
            }, { transaction });
        }

        return { snapshot, changed: true };
    })
);

const restorePosBusinessName = async ({ SystemSetting, snapshot, expectedValue }) => {
    await SystemSetting.sequelize.transaction(async (transaction) => {
        const current = await SystemSetting.findOne({
            where: { setting_key: POS_BUSINESS_NAME_SETTING_KEY },
            transaction,
            ...(transaction?.LOCK ? { lock: transaction.LOCK.UPDATE } : {})
        });
        const currentValue = current ? String(current.setting_value ?? '') : null;

        // Do not overwrite a value written by another request while compensation
        // is running. The caller will surface the failed consistency repair.
        if (current && currentValue !== expectedValue && currentValue !== snapshot.value) {
            throw new Error('POS business name changed while the business rename was being finalized.');
        }

        if (snapshot.exists) {
            if (current) {
                await current.update({ setting_value: snapshot.value }, { transaction });
            } else {
                await SystemSetting.create({
                    setting_key: POS_BUSINESS_NAME_SETTING_KEY,
                    setting_value: snapshot.value,
                    data_type: snapshot.dataType || 'string',
                    description: snapshot.description || POS_BUSINESS_NAME_SETTING_DESCRIPTION
                }, { transaction });
            }
        } else if (current) {
            await current.destroy({ transaction });
        }
    });
};

export const businessAdminCompanyRepository = {
    async updateCanonicalName({ tenantId, name, audit = {} } = {}) {
        const Tenant = getTenantModel();
        const TenantAdminAuditLog = getTenantAdminAuditLogModel();
        const SystemSetting = getSystemSettingModel();

        const initialTenant = await Tenant.findByPk(tenantId);
        if (!initialTenant) return null;

        const previousName = String(initialTenant.name || '');
        const posUpdate = await updatePosBusinessName({ SystemSetting, name });
        const posBusinessNameChanged = posUpdate.changed;

        let result;
        try {
            result = await Tenant.sequelize.transaction(async (transaction) => {
                const tenant = await Tenant.findByPk(tenantId, {
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!tenant) return null;

                const currentName = String(tenant.name || '');
                if (currentName !== previousName && currentName !== name) {
                    return {
                        status: 'conflict',
                        tenant_id: tenant.id,
                        name: currentName,
                        previous_name: currentName
                    };
                }

                const canonicalNameChanged = currentName !== name;
                if (canonicalNameChanged) {
                    await tenant.update({ name }, { transaction });
                }

                if (!canonicalNameChanged && !posBusinessNameChanged) {
                    return {
                        status: 'unchanged',
                        tenant_id: tenant.id,
                        name: currentName,
                        previous_name: currentName,
                        canonical_name_changed: false,
                        pos_business_name_changed: false,
                        pos_business_name: name
                    };
                }

                await TenantAdminAuditLog.create({
                    tenant_id: tenant.id,
                    action: 'business_name_update',
                    actor_username: String(audit.actorUsername || 'admin').slice(0, 120),
                    reason: 'Canonical business name and POS display name updated from OPIS.',
                    request_id: audit.requestId || null,
                    ip_address: audit.ipAddress || null,
                    user_agent: audit.userAgent || null,
                    before_snapshot: {
                        name: currentName,
                        pos_business_name: posUpdate.snapshot.value
                    },
                    after_snapshot: {
                        name,
                        pos_business_name: name
                    },
                    metadata: {
                        source: 'opis_business_admin',
                        tenant_id: tenant.id,
                        canonical_name_changed: canonicalNameChanged,
                        pos_business_name_changed: posBusinessNameChanged
                    }
                }, { transaction });

                return {
                    status: 'updated',
                    tenant_id: tenant.id,
                    name,
                    previous_name: currentName,
                    canonical_name_changed: canonicalNameChanged,
                    pos_business_name_changed: posBusinessNameChanged,
                    pos_business_name: name
                };
            });
        } catch (error) {
            try {
                await restorePosBusinessName({
                    SystemSetting,
                    snapshot: posUpdate.snapshot,
                    expectedValue: name
                });
            } catch (compensationError) {
                error.compensationError = compensationError;
            }
            throw error;
        }

        if (!result || result.status === 'conflict') {
            await restorePosBusinessName({
                SystemSetting,
                snapshot: posUpdate.snapshot,
                expectedValue: name
            });
        }

        return result;
    }
};
