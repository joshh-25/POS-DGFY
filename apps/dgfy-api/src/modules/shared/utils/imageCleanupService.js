import fs from 'fs/promises';
import path from 'path';
import logger from '../../../config/logger.js';
import dbStore from '../../../utils/dbStore.js';
import { removeOptimizedImageAsset } from './imageAssetStorage.js';

export const isAssetPathReferencedByOtherItems = async ({ storedPath, excludeItemId = null }) => {
    if (!storedPath || typeof storedPath !== 'string') return false;

    const normalizedTarget = storedPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalizedTarget) return false;

    const StorefrontCatalogOverride = dbStore.get('StorefrontCatalogOverride');
    if (!StorefrontCatalogOverride) return false;

    try {
        const overrides = await StorefrontCatalogOverride.findAll({
            attributes: ['item_id', 'storefront_image_path', 'storefront_image_url', 'storefront_image_gallery'],
            raw: true
        });

        for (const override of overrides) {
            if (excludeItemId && Number(override.item_id) === Number(excludeItemId)) {
                continue;
            }

            const primaryPath = String(override.storefront_image_path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
            if (primaryPath && primaryPath === normalizedTarget) {
                return true;
            }

            const gallery = Array.isArray(override.storefront_image_gallery)
                ? override.storefront_image_gallery
                : [];
            for (const entry of gallery) {
                const entryPath = String(entry?.path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
                if (entryPath && entryPath === normalizedTarget) {
                    return true;
                }
            }
        }
    } catch (error) {
        logger.warn('[ImageCleanupService] Reference check failed; treating asset as referenced for safety', {
            stored_path: storedPath,
            reason: error?.message
        });
        return true; // Fail safe: do not delete if query fails
    }

    return false;
};

export const safeDeleteReplacedImageAsset = async ({ uploadsRoot, storedPath, itemId = null }) => {
    if (!storedPath) return false;

    try {
        const isReferenced = await isAssetPathReferencedByOtherItems({ storedPath, excludeItemId: itemId });
        if (isReferenced) {
            logger.info('[ImageCleanupService] Skipping deletion of replaced image asset because it is referenced by another item/gallery', {
                item_id: itemId,
                stored_path: storedPath
            });
            return false;
        }

        await removeOptimizedImageAsset({ uploadsRoot, storedPath });
        logger.info('[ImageCleanupService] Successfully cleaned up replaced image asset', {
            item_id: itemId,
            stored_path: storedPath
        });
        return true;
    } catch (cleanupError) {
        logger.warn('[ImageCleanupService] Post-commit image asset cleanup failed; scheduling asynchronous retry', {
            item_id: itemId,
            stored_path: storedPath,
            reason: cleanupError?.message
        });

        // Queue async retry
        setTimeout(async () => {
            try {
                const recheckReferenced = await isAssetPathReferencedByOtherItems({ storedPath, excludeItemId: itemId });
                if (!recheckReferenced) {
                    await removeOptimizedImageAsset({ uploadsRoot, storedPath });
                    logger.info('[ImageCleanupService] Asynchronous image asset cleanup retry succeeded', { stored_path: storedPath });
                }
            } catch (retryError) {
                logger.warn('[ImageCleanupService] Asynchronous image asset cleanup retry failed', {
                    stored_path: storedPath,
                    reason: retryError?.message
                });
            }
        }, 3000);

        return false;
    }
};
