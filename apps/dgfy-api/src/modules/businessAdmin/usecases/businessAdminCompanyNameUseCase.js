import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';
import { canEditBusinessIdentity, resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const accessDenied = (message, reasonCode = 'BUSINESS_ADMIN_ACCESS_DENIED') => fail(new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    message,
    { statusCode: 403, details: { reason_code: reasonCode } }
));

export const buildUpdateBusinessAdminCompanyNameUseCase = ({
    businessAdminCompanyRepository,
    syncStorefrontDiscoveryWithReliability = null,
    publishPosSettingsChange = null,
    logger = null
}) => async ({ body = {}, user = {}, tenant = null, auditContext = {} } = {}) => {
    try {
        const access = resolveBusinessAdminAccess(user);
        if (!access.allowed) return accessDenied(access.reason);
        if (!canEditBusinessIdentity(user)) {
            return accessDenied(
                'Only an admin can rename the business.',
                'BUSINESS_NAME_EDIT_DENIED'
            );
        }

        const name = String(body?.name || '').trim();
        if (name.length < 2 || name.length > 255) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Business name must be between 2 and 255 characters.',
                { statusCode: 422, details: { field: 'name' } }
            ));
        }
        if (!tenant?.id) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Business context is required to rename the business.',
                { statusCode: 400 }
            ));
        }

        const result = await businessAdminCompanyRepository.updateCanonicalName({
            tenantId: tenant.id,
            name,
            audit: {
                actorUsername: user.username || user.email || 'admin',
                requestId: auditContext.requestId,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent
            }
        });
        if (!result) {
            return fail(new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Business not found.', { statusCode: 404 }));
        }
        if (result.status === 'conflict') {
            return fail(new DomainError(
                DomainErrorCode.CONFLICT,
                'The business name changed in another session. Refresh and try again.',
                { statusCode: 409, details: { reason_code: 'BUSINESS_NAME_CHANGED_CONCURRENTLY' } }
            ));
        }

        let storefrontSync = { ok: true, status: 'not_required' };
        const canonicalNameChanged = result.canonical_name_changed ?? result.status === 'updated';
        if (canonicalNameChanged && typeof syncStorefrontDiscoveryWithReliability === 'function') {
            try {
                const syncResult = await syncStorefrontDiscoveryWithReliability({
                    tenantId: result.tenant_id,
                    source: 'opis_business_name_update',
                    requestId: auditContext.requestId || null
                });
                storefrontSync = {
                    ok: syncResult?.ok === true,
                    status: syncResult?.ok === true ? 'synchronized' : 'sync_pending',
                    attempts: Number(syncResult?.attempts || 0),
                    reconciled: syncResult?.reconciled === true
                };
            } catch (syncError) {
                logger?.warn?.('[BusinessAdmin] Storefront discovery sync failed after business name update', {
                    tenantId: result.tenant_id,
                    error: syncError?.message || 'unknown_error'
                });
                storefrontSync = { ok: false, status: 'sync_pending', attempts: 0, reconciled: false };
            }
        }

        const posSettingsChanged = canonicalNameChanged === true
            || result.pos_business_name_changed === true;
        if (posSettingsChanged && typeof publishPosSettingsChange === 'function') {
            try {
                await publishPosSettingsChange({
                    tenantId: result.tenant_id,
                    reason: 'business_name_updated'
                });
            } catch (settingsChangeError) {
                // The database update is already committed. A failed invalidation
                // must not turn a successful rename into a false failure; POS still
                // has the existing focus/visibility revalidation fallback.
                logger?.warn?.('[BusinessAdmin] POS settings invalidation failed after business name update', {
                    tenantId: result.tenant_id,
                    error: settingsChangeError?.message || 'unknown_error'
                });
            }
        }

        return ok({
            tenant_id: result.tenant_id,
            name: result.name,
            previous_name: result.previous_name,
            changed: result.status === 'updated',
            pos_business_name: result.pos_business_name ?? result.name,
            pos_business_name_changed: result.pos_business_name_changed ?? result.status === 'updated',
            display_name_synchronized: true,
            storefront_sync: storefrontSync,
            stable_identity: {
                tenant_id_unchanged: true,
                storefront_urls_unchanged: true,
                qr_tokens_unchanged: true
            }
        });
    } catch (error) {
        logger?.error?.('[BusinessAdmin] Canonical business name update failed', {
            tenantId: tenant?.id || null,
            error: error?.message || 'unknown_error',
            compensationError: error?.compensationError?.message || null
        });
        if (isDomainError(error)) return fail(error);
        return fail(new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            'Unable to update the business name.',
            { statusCode: 500, cause: error }
        ));
    }
};
