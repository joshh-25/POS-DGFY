import dbStore from '../../../utils/dbStore.js';
import { Op } from 'sequelize';
import { assertTenantAdminRepositoryContract } from '../contracts/tenantAdminRepository.contract.js';

const getTenantModel = () => dbStore.get('Tenant');
const getSystemSettingModel = () => dbStore.get('SystemSetting');
const getUserTenantMappingModel = () => dbStore.get('UserTenantMapping');
const getPaymentModel = () => dbStore.get('Payment');
const getEngagementEventModel = () => dbStore.get('EngagementEvent');
const getAiUsageLogModel = () => dbStore.get('AiUsageLog');
const getTenantAdminAuditLogModel = () => dbStore.get('TenantAdminAuditLog');
const getCompanyRegistrationApplicationModel = () => dbStore.get('CompanyRegistrationApplication');
const getCompanyRegistrationAttemptModel = () => dbStore.get('CompanyRegistrationAttempt');
const getCompanyRegistrationEventModel = () => dbStore.get('CompanyRegistrationEvent');
const getCompanyRegistrationEmailDeliveryModel = () => dbStore.get('CompanyRegistrationEmailDelivery');
const getPlatformInvoiceModel = () => dbStore.get('PlatformInvoice');

const buildAdminTenantProjection = () => ({
    attributes: [
        'id',
        'name',
        'is_demo',
        'db_name',
        'domain',
        'status',
        'admin_email',
        'plan',
        'owner_dgfy_account_id',
        'provisioning_source',
        'ownership_status',
        'settings',
        'createdAt',
        'compliance_mode_state',
        'compliance_mode_choice_required',
        'compliance_activated_at',
        'compliance_policy_version'
    ],
    include: [{
        model: getCompanyRegistrationApplicationModel(),
        as: 'registrationApplication',
        required: false,
        attributes: ['id', 'review_status', 'provisioning_status', 'updatedAt']
    }]
});

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

    findTenantByName(name, options = {}) {
        const Tenant = getTenantModel();
        return Tenant.findOne({ where: { name }, ...options });
    },
    createTenant(payload, options = {}) {
        const Tenant = getTenantModel();
        return Tenant.create(payload, options);
    },
    findTenantById(tenantId, options = {}) {
        const Tenant = getTenantModel();
        return Tenant.findByPk(tenantId, options);
    },
    findAdminTenantById(tenantId) {
        const Tenant = getTenantModel();
        return Tenant.findOne({
            where: { id: tenantId },
            ...buildAdminTenantProjection()
        });
    },
    listTenants(where = {}) {
        const Tenant = getTenantModel();
        return Tenant.findAll({
            where,
            order: [['createdAt', 'DESC']],
            ...buildAdminTenantProjection()
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
    findCompanyRegistrationApplicationForTenant(tenantId) {
        const CompanyRegistrationApplication = getCompanyRegistrationApplicationModel();
        return CompanyRegistrationApplication.findOne({ where: { tenant_id: tenantId } });
    },
    countPlatformInvoicesForRegistrationApplication(applicationId) {
        const PlatformInvoice = getPlatformInvoiceModel();
        return PlatformInvoice.count({
            where: {
                [Op.or]: [
                    { registration_application_id: applicationId },
                    { original_registration_application_id: applicationId }
                ]
            }
        });
    },
    removeCompanyRegistrationApplicationAndHistory(applicationId) {
        const CompanyRegistrationApplication = getCompanyRegistrationApplicationModel();
        const CompanyRegistrationAttempt = getCompanyRegistrationAttemptModel();
        const CompanyRegistrationEvent = getCompanyRegistrationEventModel();
        const CompanyRegistrationEmailDelivery = getCompanyRegistrationEmailDeliveryModel();
        const PlatformInvoice = getPlatformInvoiceModel();

        return this.transaction(async (transaction) => {
            // Lock the application row before re-checking invoices so a concurrent invoice insert
            // cannot pass the pre-check and race the RESTRICT foreign key during deletion.
            const application = await CompanyRegistrationApplication.findOne({
                where: { id: applicationId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!application) return { invoiceCount: 0 };

            const invoiceCount = await PlatformInvoice.count({
                where: {
                    [Op.or]: [
                        { registration_application_id: applicationId },
                        { original_registration_application_id: applicationId }
                    ]
                },
                transaction
            });
            if (invoiceCount > 0) return { invoiceCount };

            await CompanyRegistrationEmailDelivery.destroy({ where: { application_id: applicationId }, transaction });
            await CompanyRegistrationEvent.destroy({ where: { application_id: applicationId }, transaction });
            await CompanyRegistrationAttempt.destroy({ where: { application_id: applicationId }, transaction });
            await CompanyRegistrationApplication.destroy({ where: { id: applicationId }, transaction });
            return { invoiceCount: 0 };
        });
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
