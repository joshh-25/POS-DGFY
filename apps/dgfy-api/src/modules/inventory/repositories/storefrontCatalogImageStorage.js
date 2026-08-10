import path from 'path';
import { fileURLToPath } from 'url';
import dbStore from '../../../utils/dbStore.js';
import {
    removeOptimizedImageAsset,
    storeOptimizedImageAsset
} from '../../shared/utils/imageAssetStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, '../../../../uploads');

const normalizeTenantSegment = (value) => {
    const fallback = 'default';
    const raw = String(value || fallback).trim();
    const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
    return sanitized || fallback;
};

const createLocalStorefrontCatalogImageStorage = () => ({
    async store({ itemId, originalName, reportedMime = null, tempPath }) {
        if (!tempPath) {
            throw new Error('Temporary file path is required');
        }

        const tenantId = dbStore.getStore()?.tenantId || 'default';
        const tenantSegment = normalizeTenantSegment(tenantId);
        return storeOptimizedImageAsset({
            uploadsRoot: UPLOADS_ROOT,
            surfaceFolder: 'storefront-catalog',
            scopeSegments: [tenantSegment],
            assetBaseName: `item-${itemId}`,
            originalName,
            reportedMime,
            tempPath
        });
    },

    async remove({ path: storedPath }) {
        if (!storedPath) return;
        await removeOptimizedImageAsset({ uploadsRoot: UPLOADS_ROOT, storedPath });
    }
});

export const storefrontCatalogImageStorage = createLocalStorefrontCatalogImageStorage();
export const createStorefrontCatalogImageStorage = createLocalStorefrontCatalogImageStorage;
