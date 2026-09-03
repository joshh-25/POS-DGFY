import dbStore from '../../../utils/dbStore.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const normalize = (value) => String(value || '').trim().toLowerCase();

const resolveTenantId = (actorUser) => {
    const store = dbStore.getStore() || {};
    return String(actorUser?.tenant_id || actorUser?.tenantId || store.tenantId || '').trim();
};

/**
 * `ops_workflow_mode=laundry` is only a valid projection of the immutable
 * tenant runtime ownership contract. Keep this check beside both settings
 * write paths so a single-key update cannot bypass the bulk-update guard.
 */
export const assertLaundryWorkflowModeRuntimeOwnership = async ({
    requestedMode,
    actorUser = null,
    tenantRepository = null
} = {}) => {
    if (normalize(requestedMode) !== 'laundry') return;

    const tenantId = resolveTenantId(actorUser);
    if (!tenantId || tenantId === 'default') {
        throw new DomainError(
            DomainErrorCode.TENANT_CONTEXT_MISSING,
            'A tenant context is required before enabling laundry workflow mode.',
            { statusCode: 400 }
        );
    }
    if (typeof tenantRepository?.findById !== 'function') {
        throw new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'Tenant runtime ownership could not be verified.',
            {
                statusCode: 503,
                observabilityReasonCode: 'LAUNDRY_WORKFLOW_MODE_RUNTIME_LOOKUP_UNAVAILABLE'
            }
        );
    }

    let tenant;
    try {
        tenant = await tenantRepository.findById(tenantId, {
            attributes: ['id', 'settings']
        });
    } catch (cause) {
        throw new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'Tenant runtime ownership could not be verified.',
            {
                statusCode: 503,
                cause,
                observabilityReasonCode: 'LAUNDRY_WORKFLOW_MODE_RUNTIME_LOOKUP_FAILED'
            }
        );
    }

    if (!tenant) {
        throw new DomainError(
            DomainErrorCode.TENANT_NOT_FOUND,
            'Tenant runtime ownership could not be verified.',
            { statusCode: 404 }
        );
    }

    const settings = tenant.settings || tenant.dataValues?.settings || {};
    if (
        normalize(settings.business_mode) !== 'laundry'
        || normalize(settings.runtime_owner) !== 'dglaundry'
    ) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'ops_workflow_mode=laundry requires immutable business_mode=laundry and runtime_owner=dglaundry.',
            {
                statusCode: 409,
                details: {
                    reason_code: 'LAUNDRY_WORKFLOW_MODE_RUNTIME_MISMATCH'
                }
            }
        );
    }
};

