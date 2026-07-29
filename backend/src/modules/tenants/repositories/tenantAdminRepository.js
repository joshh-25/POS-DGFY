import dbStore from '../../../utils/dbStore.js';
import { assertTenantAdminRepositoryContract } from '../contracts/tenantAdminRepository.contract.js';

const getTenantModel = () => dbStore.get('Tenant');
const getSystemSettingModel = () => dbStore.get('SystemSetting');
const getUserTenantMappingModel = () => dbStore.get('UserTenantMapping');
const getPaymentModel = () => dbStore.get('Payment');
const getEngagementEventModel = () => dbStore.get('EngagementEvent');
const getAiUsageLogModel = () => dbStore.get('AiUsageLog');
const getTenantAdminAuditLogModel = () => dbStore.get('TenantAdminAuditLog');
const getCompanyRegistrationApplicationModel = () => dbStore.get('CompanyRegistrationApplication');

const COMPLIANCE_TRANSITIONS = Object.freeze({
    non_compliant_active: new Set(['non_compliant_active', 'compliant_pending']),
    compliant_pending: new Set(['compliant_pending', 'compliant_active']),
    compliant_active: new Set(['compliant_active'])
});

const assertComplianceTransition = ({ previousState, nextState }) => {
    if (!nextState || previousState == null || previousState === nextState) {
        return;
    }

    const allowed = COMPLIANCE_TRANSITIONS[previousState];
    if (!allowed || !allowed.has(nextState)) {
        throw new Error(`Compliance mode transition blocked: ${previousState} -> ${nextState}`);
    }
};

export const tenantAdminRepository = {
    transaction(callback) {
        const Tenant = getTenantModel();
        return Tenant.sequelize.transaction(callback);
    },

    findTenantByName(name) {
        const Tenant = getTenantModel();
        return Tenant.findOne({ where: { name } });
    },
    createTenant(payload, options = {}) {
        const Tenant = getTenantModel();
        return Tenant.create(payload, options);
    },
    findTenantById(tenantId, options = {}) {
        const Tenant = getTenantModel();
        return Tenant.findByPk(tenantId, options);
    },
    listTenants(where = {}) {
        const Tenant = getTenantModel();
        const CompanyRegistrationApplication = getCompanyRegistrationApplicationModel();
        return Tenant.findAll({
            where,
            order: [['createdAt', 'DESC']],
            attributes: [
                'id',
                'name',
                'domain',
                'status',
                'admin_email',
                'plan',
                'owner_dgfy_account_id',
                'provisioning_source',
                'ownership_status',
                'createdAt',
                'compliance_mode_state',
                'compliance_mode_choice_required',
                'compliance_activated_at',
                'compliance_policy_version'
            ],
            include: [{ model: CompanyRegistrationApplication, as: 'registrationApplication', required: false, attributes: ['id', 'review_status', 'provisioning_status'] }]
        });
    },
    updateTenant(tenant, payload, options = {}) {
        if (payload && Object.prototype.hasOwnProperty.call(payload, 'compliance_mode_state')) {
            assertComplianceTransition({
                previousState: tenant.compliance_mode_state || null,
                nextState: payload.compliance_mode_state
            });
        }
        return tenant.update(payload, options);
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
    },
    createTenantAdminAuditLog(payload, options = {}) {
        const TenantAdminAuditLog = getTenantAdminAuditLogModel();
        return TenantAdminAuditLog.create(payload, options);
    },
    listTenantAdminAuditLogs(tenantId, { limit = 20, action = 'capability_update' } = {}) {
        const TenantAdminAuditLog = getTenantAdminAuditLogModel();
        return TenantAdminAuditLog.findAll({
            where: {
                tenant_id: tenantId,
                action
            },
            order: [['created_at', 'DESC']],
            limit: Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100)
        });
    }
};

assertTenantAdminRepositoryContract(tenantAdminRepository);
