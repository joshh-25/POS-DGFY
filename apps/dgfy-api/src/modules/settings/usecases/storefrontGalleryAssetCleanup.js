import dbStore from '../../../utils/dbStore.js';
import logger from '../../../config/logger.js';
import { normalizeStorefrontAssetPath } from '../../shared/utils/storefrontAssetPolicy.js';

const STOREFRONT_GALLERY_SETTING_KEY = 'storefront_gallery_images';

const normalizeTenantSegment = (value) => {
    const fallback = 'default';
    const raw = String(value || fallback).trim();
    const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
    return sanitized || fallback;
};

const pathFromGalleryEntry = (entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
    const directPath = normalizeStorefrontAssetPath(entry.path);
    if (directPath) return directPath;

    const rawUrl = String(entry.url || '').trim();
    if (!rawUrl.startsWith('/uploads/')) return '';
    return normalizeStorefrontAssetPath(rawUrl.replace(/^\/uploads\//, ''));
};

const collectTenantGalleryPaths = (entries, tenantSegment) => {
    if (!Array.isArray(entries)) return new Set();
    const tenantPrefix = `storefront-assets/${tenantSegment}/`;
    return new Set(
        entries
            .map(pathFromGalleryEntry)
            .filter((storedPath) => storedPath && storedPath.startsWith(tenantPrefix))
    );
};

export const snapshotStorefrontGalleryCleanup = async ({ settingsRepository, settingsData }) => {
    if (
        !Object.prototype.hasOwnProperty.call(settingsData || {}, STOREFRONT_GALLERY_SETTING_KEY)
        || typeof settingsRepository?.getSettingsByKeys !== 'function'
    ) {
        return null;
    }

    const tenantId = dbStore.getStore()?.tenantId;
    if (!tenantId || tenantId === 'default') return null;

    const tenantSegment = normalizeTenantSegment(tenantId);
    const currentSettings = await settingsRepository.getSettingsByKeys([STOREFRONT_GALLERY_SETTING_KEY]).catch(() => ({}));
    const previousPaths = collectTenantGalleryPaths(
        currentSettings?.[STOREFRONT_GALLERY_SETTING_KEY]?.value,
        tenantSegment
    );
    const nextPaths = collectTenantGalleryPaths(settingsData[STOREFRONT_GALLERY_SETTING_KEY], tenantSegment);

    const omittedPaths = [...previousPaths].filter((storedPath) => !nextPaths.has(storedPath));
    return omittedPaths.length > 0 ? omittedPaths : null;
};

export const cleanupOmittedStorefrontGalleryAssets = async ({ omittedPaths, storefrontAssetStorage }) => {
    if (!Array.isArray(omittedPaths) || omittedPaths.length === 0 || typeof storefrontAssetStorage?.remove !== 'function') {
        return;
    }

    await Promise.all(omittedPaths.map(async (storedPath) => {
        try {
            await storefrontAssetStorage.remove({ path: storedPath });
        } catch (error) {
            logger.warn('[SettingsStorefrontGallery] Failed to remove omitted gallery asset', {
                signal_code: 'storefront_gallery_asset_cleanup_failed',
                path: storedPath,
                error: error?.message || String(error)
            });
        }
    }));
};
