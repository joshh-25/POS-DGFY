import dbStore from '../../../utils/dbStore.js';
import { assertTenantAdminRepositoryContract } from '../contracts/tenantAdminRepository.contract.js';

const getTenantModel = () => dbStore.get('Tenant');
const getSystemSettingModel = () => dbStore.get('SystemSetting');
const getUserTenantMappingModel = () => dbStore.get('UserTenantMapping');
const getPaymentModel = () => dbStore.get('Payment');
const getEngagementEventModel = () => dbStore.get('EngagementEvent');
const getAiUsageLogModel = () => dbStore.get('AiUsageLog');

export const tenantAdminRepository = {
    findTenantByName(name) {
        const Tenant = getTenantModel();
        return Tenant.findOne({ where: { name } });
    },
    createTenant(payload) {
        const Tenant = getTenantModel();
        return Tenant.create(payload);
    },
    findTenantById(tenantId) {
        const Tenant = getTenantModel();
        return Tenant.findByPk(tenantId);
    },
    listTenants(where = {}) {
        const Tenant = getTenantModel();
        return Tenant.findAll({
            where,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'name', 'domain', 'company_token', 'status', 'admin_email', 'plan', 'createdAt']
        });
    },
    updateTenant(tenant, payload) {
        return tenant.update(payload);
    },
    async removeTenantDependencies(tenantId) {
        const UserTenantMapping = getUserTenantMappingModel();
        const Payment = getPaymentModel();
        const EngagementEvent = getEngagementEventModel();
        const AiUsageLog = getAiUsageLogModel();

        await UserTenantMapping.destroy({ where: { tenant_id: tenantId } });
        await Payment.destroy({ where: { tenant_id: tenantId } });
        await EngagementEvent.destroy({ where: { tenant_id: tenantId } });
        await AiUsageLog.destroy({ where: { tenant_id: tenantId } });
    },
    destroyTenant(tenant, options = {}) {
        return tenant.destroy(options);
    },
    findSystemSettings(keys) {
        const SystemSetting = getSystemSettingModel();
        return SystemSetting.findAll({
            where: {
                setting_key: keys
            }
        });
    },
    updateSystemSetting(key, value) {
        const SystemSetting = getSystemSettingModel();
        return SystemSetting.update(
            { setting_value: String(value) },
            { where: { setting_key: key } }
        );
    }
};

assertTenantAdminRepositoryContract(tenantAdminRepository);
