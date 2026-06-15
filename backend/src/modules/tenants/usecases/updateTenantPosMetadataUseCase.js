import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';
import { updateTenantPosMetadataSettings } from './tenantPosMetadataSettings.js';

const normalizeReason = (reason) => String(reason || '').trim().slice(0, 500);

export const buildUpdateTenantPosMetadataUseCase = ({
    tenantAdminRepository,
    tenantConnector,
    updateSettingsUseCase,
    logger
}) => {
    return async ({ id, body = {}, actor = {}, metadata = {} }) => {
        try {
            const reason = normalizeReason(body?.reason);
            if (reason.length < 3) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'reason is required and must be at least 3 characters',
                    { statusCode: 422 }
                ));
            }
            const tenant = await tenantAdminRepository.findTenantById(id);
            if (!tenant) {
                return fail(new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found', { statusCode: 404 }));
            }

            const result = await updateTenantPosMetadataSettings({
                tenant,
                tenantConnector,
                payload: body,
                actorUser: {
                    username: actor?.username || 'platform_admin',
                    is_platform_admin: true
                },
                applyApprovedSettings: updateSettingsUseCase,
                beforePendingRejectAudit: async ({ before }) => {
                    await tenantAdminRepository.createTenantAdminAuditLog({
                        tenant_id: tenant.id,
                        action: 'pos_metadata_update',
                        actor_username: String(actor?.username || 'platform_admin').slice(0, 120),
                        reason,
                        request_id: metadata?.request_id || null,
                        ip_address: metadata?.ip_address || null,
                        user_agent: metadata?.user_agent || null,
                        before_snapshot: before,
                        after_snapshot: before,
                        metadata: {
                            pending_action: 'reject',
                            software_keys: []
                        }
                    });
                }
            });

            if (!result.audit_logged) {
                await tenantAdminRepository.createTenantAdminAuditLog({
                    tenant_id: tenant.id,
                    action: 'pos_metadata_update',
                    actor_username: String(actor?.username || 'platform_admin').slice(0, 120),
                    reason,
                    request_id: metadata?.request_id || null,
                    ip_address: metadata?.ip_address || null,
                    user_agent: metadata?.user_agent || null,
                    before_snapshot: result.before,
                    after_snapshot: result.after,
                    metadata: {
                        pending_action: body?.pending_action || null,
                        software_keys: Object.keys(body?.software_settings || {})
                    }
                });
            }

            return ok({
                tenant_id: tenant.id,
                tenant_name: tenant.name,
                current: result.after,
                pending_review: result.pending_review
            });
        } catch (error) {
            logger?.error?.('Update tenant POS metadata error:', error);
            if (isDomainError(error)) {
                return fail(error);
            }
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to update tenant POS metadata',
                { statusCode: 500 }
            ));
        }
    };
};
