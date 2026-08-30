import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const toPlain = (row) => {
    if (!row) return null;
    return typeof row.get === 'function' ? row.get({ plain: true }) : { ...row };
};

const serializeAuditLog = (row) => {
    const plain = toPlain(row) || {};
    return {
        id: plain.tenant_admin_audit_log_id,
        tenant_id: plain.tenant_id,
        action: plain.action,
        actor_username: plain.actor_username,
        reason: plain.reason,
        request_id: plain.request_id || null,
        ip_address: plain.ip_address || null,
        user_agent: plain.user_agent || null,
        before_snapshot: plain.before_snapshot || null,
        after_snapshot: plain.after_snapshot || null,
        metadata: plain.metadata || {},
        created_at: plain.created_at || plain.createdAt || null
    };
};

const buildListTenantAdminAuditLogsUseCase = ({ tenantAdminRepository, logger, action, logName }) => {
    return async ({ id, limit = 20 }) => {
        try {
            const tenant = await tenantAdminRepository.findTenantById(id);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            const logs = await tenantAdminRepository.listTenantAdminAuditLogs(id, { limit, action });
            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    data: {
                        tenant_id: Number(id),
                        logs: logs.map(serializeAuditLog)
                    }
                }
            });
        } catch (error) {
            logger?.error?.(`List tenant ${logName} audit logs error:`, error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || `Failed to list tenant ${logName} audit logs`,
                { statusCode: 500 }
            ));
        }
    };
};

export const buildListTenantCapabilityAuditLogsUseCase = (deps) => buildListTenantAdminAuditLogsUseCase({
    ...deps,
    action: 'capability_update',
    logName: 'capability'
});

export const buildListTenantPosMetadataAuditLogsUseCase = (deps) => buildListTenantAdminAuditLogsUseCase({
    ...deps,
    action: 'pos_metadata_update',
    logName: 'POS metadata'
});

export const buildListTenantAffiliateSlotsAuditLogsUseCase = (deps) => buildListTenantAdminAuditLogsUseCase({
    ...deps,
    action: 'affiliate_slots_update',
    logName: 'affiliate slots'
});
