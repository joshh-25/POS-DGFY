import dbStore from '../../../utils/dbStore.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const PUBLIC_HANDLE_KEY = 'store_tenant_slug';
const RESERVED_ROOT_HANDLES = new Set([
    'api',
    'admin',
    'assets',
    'dashboard',
    'dgfy',
    'favicon.ico',
    'health',
    'legal',
    'login',
    'logout',
    'map-dgfy',
    'manifest.json',
    'platform-admin',
    'register',
    'settings',
    'store',
    'tenant-store',
    'uploads'
]);

const normalizePublicHandle = (value) => String(value || '').trim().toLowerCase();

export const assertPublicStorefrontHandleAvailable = async ({ handleValue, settingsRepository }) => {
    const handle = normalizePublicHandle(handleValue);
    if (!handle) return;

    if (RESERVED_ROOT_HANDLES.has(handle)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Store tenant slug is reserved for DGFY system routes.',
            {
                statusCode: 422,
                details: { reason_code: 'STOREFRONT_HANDLE_RESERVED', handle }
            }
        );
    }

    const tenantId = dbStore.getStore()?.tenantId || null;
    if (
        !tenantId
        || tenantId === 'default'
        || typeof settingsRepository?.findPublicStorefrontHandleOwner !== 'function'
    ) {
        return;
    }

    const existing = await settingsRepository.findPublicStorefrontHandleOwner(handle);
    if (!existing) return;

    if (String(existing?.tenant_id || '') === String(tenantId)) return;

    throw new DomainError(
        DomainErrorCode.CONFLICT,
        'Store tenant slug is already used by another company.',
        {
            statusCode: 409,
            details: { reason_code: 'STOREFRONT_HANDLE_NOT_UNIQUE', handle }
        }
    );
};

export const assertPublicStorefrontHandlePatch = async ({ settingsData = {}, settingsRepository }) => {
    if (!Object.prototype.hasOwnProperty.call(settingsData || {}, PUBLIC_HANDLE_KEY)) return;
    await assertPublicStorefrontHandleAvailable({
        handleValue: settingsData[PUBLIC_HANDLE_KEY],
        settingsRepository
    });
};
