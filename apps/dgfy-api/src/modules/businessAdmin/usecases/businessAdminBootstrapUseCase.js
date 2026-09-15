import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    buildBusinessAdminCapabilities,
    resolveBusinessAdminAccess
} from '../domain/businessAdminAccessPolicy.js';

const ok = (data) => ({ success: true, data });
const fail = (message) => ({
    success: false,
    error: new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, message, {
        statusCode: 403,
        details: { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' }
    })
});

const defaultWorkflowCapabilityResolver = async () => ({
    mode: null,
    capabilities: {
        fnbDining: false,
        tableService: false,
        kitchenQueue: false,
        restaurantServiceCharge: false
    }
});

export const buildGetBusinessAdminBootstrapUseCase = ({
    businessAdminOverviewRepository,
    workflowCapabilityResolver = defaultWorkflowCapabilityResolver
}) => async ({
    user = {},
    tenant = null
} = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) return fail(access.reason);

    const assignedLocationIds = access.scope === 'all'
        ? []
        : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);

    if (access.scope === 'assigned' && assignedLocationIds.length === 0) {
        return fail('No branch access is assigned to this user.');
    }

    const branches = await businessAdminOverviewRepository.listActiveLocations({
        allowedLocationIds: access.scope === 'assigned' ? assignedLocationIds : null
    });
    const workflow = await workflowCapabilityResolver();

    const capabilities = buildBusinessAdminCapabilities(user);

    return ok({
        user: {
            user_id: user.user_id,
            username: user.username || '',
            email: user.email || '',
            role: user.role || '',
            role_preset_key: user.role_preset_key || null,
            is_master_admin: user.is_master_admin === true
        },
        business: {
            tenant_id: tenant?.id || null,
            name: tenant?.name || 'Business',
            branches: branches.map((branch) => ({
                branch_id: Number(branch.location_id),
                name: branch.name || `Branch ${branch.location_id}`
            }))
        },
        access: {
            scope: access.scope,
            location_ids: assignedLocationIds,
            capabilities,
            settings_sections: capabilities.settings_sections
        },
        workflow,
        reporting: {
            timezone: 'Asia/Manila',
            currency: 'PHP',
            as_of: new Date().toISOString()
        }
    });
};
