import dbStore from '../../../utils/dbStore.js';
import { resolveBusinessAdminAccess } from '../../businessAdmin/domain/businessAdminAccessPolicy.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { fail, ok } from '../../shared/contracts/applicationResult.js';

const isAdminLike = (user = {}) => (
    user?.is_master_admin === true || String(user?.role || '').trim().toLowerCase() === 'admin'
);

const normalizeId = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeDesign = (design = {}) => {
    const source = design && typeof design === 'object' && !Array.isArray(design) ? design : {};
    return {
        foreground: String(source.foreground || '#0f172a').trim().toLowerCase(),
        background: String(source.background || '#ffffff').trim().toLowerCase(),
        width: Math.min(800, Math.max(180, Number.parseInt(source.width, 10) || 320)),
        margin: Math.min(8, Math.max(0, Number.parseInt(source.margin, 10) || 2)),
        error_correction_level: ['L', 'M', 'Q', 'H'].includes(String(source.error_correction_level || '').toUpperCase())
            ? String(source.error_correction_level).toUpperCase()
            : 'M'
    };
};

const failure = (code, message, statusCode, reasonCode) => fail(new DomainError(code, message, {
    statusCode,
    details: reasonCode ? { reason_code: reasonCode } : null
}));

const resolveScope = async (user = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) {
        return { error: failure(DomainErrorCode.AUTHORIZATION_FAILED, access.reason || 'Business Admin access is required.', 403, 'BUSINESS_ADMIN_ACCESS_REQUIRED') };
    }
    if (access.scope === 'all' || isAdminLike(user)) return { access, allowedLocationIds: null };

    const UserLocationGrant = dbStore.get('UserLocationGrant');
    const rows = await UserLocationGrant.findAll({
        where: { user_id: user.user_id },
        attributes: ['location_id'],
        raw: true
    });
    const allowedLocationIds = [...new Set(rows
        .map((row) => normalizeId(row.location_id))
        .filter(Boolean))];
    if (allowedLocationIds.length === 0) {
        return { error: failure(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED') };
    }
    return { access, allowedLocationIds };
};

const assertLocationAllowed = (locationId, allowedLocationIds) => {
    if (locationId != null && Array.isArray(allowedLocationIds) && !allowedLocationIds.includes(locationId)) {
        return failure(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED');
    }
    return null;
};

const serializeResult = (qrCode, tenantSlug) => ({
    ...qrCode,
    store_slug: tenantSlug || null,
    storefront_url: null
});

const resolveTenantSlug = async (repository, tenantSlug) => {
    const suppliedSlug = String(tenantSlug || '').trim().toLowerCase();
    if (suppliedSlug) return suppliedSlug;
    if (typeof repository?.getStorefrontSlug !== 'function') return null;
    return repository.getStorefrontSlug();
};

export const buildListStorefrontQrCodesUseCase = ({ repository }) => async ({ query = {}, user = {}, tenantSlug = null } = {}) => {
    try {
        const scope = await resolveScope(user);
        if (scope.error) return scope.error;
        const locationId = query.location_id == null ? null : normalizeId(query.location_id);
        if (query.location_id != null && !locationId) {
            return failure(DomainErrorCode.VALIDATION_FAILED, 'location_id must be a positive integer.', 422, 'QR_LOCATION_INVALID');
        }
        const locationError = assertLocationAllowed(locationId, scope.allowedLocationIds);
        if (locationError) return locationError;
        const qrCodes = await repository.list({ locationId, allowedLocationIds: scope.allowedLocationIds });
        const resolvedTenantSlug = await resolveTenantSlug(repository, tenantSlug);
        return ok({
            qr_codes: qrCodes.map((qrCode) => serializeResult(qrCode, resolvedTenantSlug)),
            store_slug: resolvedTenantSlug || null,
            location_scope: scope.allowedLocationIds || 'all'
        });
    } catch {
        return failure(DomainErrorCode.INTERNAL_ERROR, 'Failed to list storefront QR codes.', 500, 'QR_CODE_LIST_FAILED');
    }
};

export const buildCreateStorefrontQrCodeUseCase = ({ repository }) => async ({ payload = {}, user = {}, tenantSlug = null } = {}) => {
    try {
        const scope = await resolveScope(user);
        if (scope.error) return scope.error;
        const locationId = normalizeId(payload.location_id);
        if (!locationId) return failure(DomainErrorCode.VALIDATION_FAILED, 'location_id must be a positive integer.', 422, 'QR_LOCATION_INVALID');
        const locationError = assertLocationAllowed(locationId, scope.allowedLocationIds);
        if (locationError) return locationError;

        const targetType = String(payload.target_type || 'catalog').trim().toLowerCase();
        if (!['catalog', 'category'].includes(targetType)) {
            return failure(DomainErrorCode.VALIDATION_FAILED, 'target_type must be catalog or category.', 422, 'QR_TARGET_INVALID');
        }
        const location = await repository.findActiveLocation(locationId);
        if (!location) return failure(DomainErrorCode.RESOURCE_NOT_FOUND, 'The selected branch is not active.', 404, 'QR_LOCATION_NOT_FOUND');

        const folderId = targetType === 'category' ? normalizeId(payload.folder_id) : null;
        if (targetType === 'category' && !folderId) {
            return failure(DomainErrorCode.VALIDATION_FAILED, 'folder_id is required for a category QR code.', 422, 'QR_CATEGORY_REQUIRED');
        }
        const folder = folderId ? await repository.findActiveFolder(folderId) : null;
        if (targetType === 'category' && !folder) {
            return failure(DomainErrorCode.RESOURCE_NOT_FOUND, 'The selected category is not active.', 404, 'QR_CATEGORY_NOT_FOUND');
        }

        const qrCode = await repository.create({
            location_id: locationId,
            target_type: targetType,
            folder_id: folderId,
            label: String(payload.label || (targetType === 'category' ? folder?.name : 'All products')).trim() || null,
            design: normalizeDesign(payload.design),
            is_active: true,
            created_by: normalizeId(user.user_id),
            updated_by: normalizeId(user.user_id)
        });
        return ok(serializeResult(qrCode, await resolveTenantSlug(repository, tenantSlug)));
    } catch {
        return failure(DomainErrorCode.INTERNAL_ERROR, 'Failed to create storefront QR code.', 500, 'QR_CODE_CREATE_FAILED');
    }
};

export const buildUpdateStorefrontQrCodeUseCase = ({ repository }) => async ({ id, payload = {}, user = {}, tenantSlug = null } = {}) => {
    try {
        const scope = await resolveScope(user);
        if (scope.error) return scope.error;
        const qrCodeId = normalizeId(id);
        if (!qrCodeId) return failure(DomainErrorCode.VALIDATION_FAILED, 'QR code id must be a positive integer.', 422, 'QR_ID_INVALID');
        const current = await repository.findById(qrCodeId);
        if (!current) return failure(DomainErrorCode.RESOURCE_NOT_FOUND, 'QR code not found.', 404, 'QR_CODE_NOT_FOUND');
        const locationError = assertLocationAllowed(current.location_id, scope.allowedLocationIds);
        if (locationError) return locationError;

        const values = { updated_by: normalizeId(user.user_id) };
        if (Object.prototype.hasOwnProperty.call(payload, 'label')) values.label = String(payload.label || '').trim() || null;
        if (Object.prototype.hasOwnProperty.call(payload, 'design')) values.design = normalizeDesign(payload.design);
        if (Object.prototype.hasOwnProperty.call(payload, 'is_active')) values.is_active = payload.is_active === true;
        const qrCode = await repository.update(qrCodeId, values);
        return ok(serializeResult(qrCode, await resolveTenantSlug(repository, tenantSlug)));
    } catch {
        return failure(DomainErrorCode.INTERNAL_ERROR, 'Failed to update storefront QR code.', 500, 'QR_CODE_UPDATE_FAILED');
    }
};

export const buildDeactivateStorefrontQrCodeUseCase = ({ repository }) => async ({ id, user = {}, tenantSlug = null } = {}) => {
    try {
        const scope = await resolveScope(user);
        if (scope.error) return scope.error;
        const qrCodeId = normalizeId(id);
        const current = qrCodeId ? await repository.findById(qrCodeId) : null;
        if (!current) return failure(DomainErrorCode.RESOURCE_NOT_FOUND, 'QR code not found.', 404, 'QR_CODE_NOT_FOUND');
        const locationError = assertLocationAllowed(current.location_id, scope.allowedLocationIds);
        if (locationError) return locationError;
        const qrCode = await repository.deactivate(qrCodeId, normalizeId(user.user_id));
        return ok(serializeResult(qrCode, await resolveTenantSlug(repository, tenantSlug)));
    } catch {
        return failure(DomainErrorCode.INTERNAL_ERROR, 'Failed to deactivate storefront QR code.', 500, 'QR_CODE_DEACTIVATE_FAILED');
    }
};

export const buildResolvePublicStorefrontQrCodeUseCase = ({ repository }) => async ({ token, requestedLocationId = null } = {}) => {
    try {
        return ok(await repository.findActiveByToken({ token, requestedLocationId }));
    } catch {
        return failure(DomainErrorCode.INTERNAL_ERROR, 'Failed to resolve storefront QR code.', 500, 'QR_CODE_RESOLVE_FAILED');
    }
};
