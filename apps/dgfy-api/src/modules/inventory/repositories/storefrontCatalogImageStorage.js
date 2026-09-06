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
    async store({
        itemId,
        originalName,
        reportedMime = null,
        tempPath,
        // Phase 301 (#265): optional client-derived-variant contract, threaded straight through to
        // storeOptimizedImageAsset -- see that function's own docs for what each does. All inert
        // when omitted, so every pre-existing caller (including itemImageWorker.js's generated-image
        // path, which never passes any of these) is unaffected.
        sourceMimeHint = null,
        acceptedAsClientLarge = false,
        clientVariantFiles = null,
        // Phase 298 (#265): observability-only, threaded straight through -- see
        // imageAssetStorage.js's own docs.
        imageClientConversionState = null,
        imageClientConversionScope = null
    }) {
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
            tempPath,
            // Phase 301 (#265) resolution of the #265 epic's original-retention question (ADR 0017
            // amendment): retain the raw original for storefront-catalog-image uploads, since this
            // is IMS's managed surface, not POS's. Was unconditionally `false`; the two surfaces
            // used to be identical here. Keyed off which storage module handles the call -- no new
            // client-sent origin signal.
            retainOriginal: true,
            sourceMimeHint,
            acceptedAsClientLarge,
            clientVariantFiles,
            imageClientConversionState,
            imageClientConversionScope
        });
    },

    async remove({ path: storedPath }) {
        if (!storedPath) return;
        await removeOptimizedImageAsset({ uploadsRoot: UPLOADS_ROOT, storedPath });
    }
});

export const storefrontCatalogImageStorage = createLocalStorefrontCatalogImageStorage();
export const createStorefrontCatalogImageStorage = createLocalStorefrontCatalogImageStorage;
