import { DgfyAccount, DgfyAccountTenantMembership, Tenant } from '../../../models/index.js';
import tenantConnector from '../../../utils/TenantConnector.js';
import dbStore from '../../../utils/dbStore.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';

const activeMembershipWhere = {
    status: 'accepted'
};

export const businessAdminMultiCompanyRepository = {
    async listAcceptedMembershipsForTenantUser({ tenantId, tenantUserId } = {}) {
        if (!tenantId || !tenantUserId) return { dgfyAccountId: null, memberships: [] };

        const currentMembership = await DgfyAccountTenantMembership.findOne({
            where: {
                ...activeMembershipWhere,
                tenant_id: tenantId,
                tenant_user_id: tenantUserId
            },
            include: [{
                model: DgfyAccount,
                as: 'dgfyAccount',
                required: true,
                where: { is_active: true, deleted_at: null },
                attributes: ['id']
            }]
        });
        const dgfyAccountId = currentMembership?.dgfy_account_id || null;
        if (!dgfyAccountId) return { dgfyAccountId: null, memberships: [] };

        const memberships = await DgfyAccountTenantMembership.findAll({
            where: {
                ...activeMembershipWhere,
                dgfy_account_id: dgfyAccountId
            },
            include: [{
                model: Tenant,
                as: 'tenant',
                required: true,
                where: { status: 'active' },
                attributes: ['id', 'name', 'db_name', 'company_token', 'status', 'plan']
            }],
            order: [['updated_at', 'DESC'], ['id', 'DESC']]
        });

        return { dgfyAccountId, memberships };
    },

    async withAcceptedTenantMembership({ membership, dgfyAccountId } = {}, callback) {
        const tenant = membership?.tenant;
        if (!membership?.id || !tenant?.id || !tenant?.company_token || !dgfyAccountId) return null;

        // Recheck the membership immediately before entering another tenant database.
        // This keeps a stale browser view or a concurrently revoked membership fail-closed.
        const currentMembership = await DgfyAccountTenantMembership.findOne({
            where: {
                id: membership.id,
                dgfy_account_id: dgfyAccountId,
                tenant_id: tenant.id,
                status: 'accepted'
            }
        });
        if (!currentMembership) return null;

        const sequelize = await tenantConnector.getConnection(tenant, 'repository.business-admin-multi-company');
        const tenantModels = getTenantModels(sequelize);
        return dbStore.run({
            sequelize,
            tenantId: tenant.id,
            tenantToken: tenant.company_token,
            tenantName: tenant.name,
            tenantPlan: tenant.plan,
            ...tenantModels
        }, async () => {
            const User = dbStore.get('User');
            const user = await User.findByPk(currentMembership.tenant_user_id);
            if (!user || !user.is_active || user.deleted_at) return null;
            return callback({ tenant, user, membership: currentMembership });
        });
    }
};
