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

const createLocalPosCatalogImageStorage = () => ({
    async store({
        itemId,
        originalName,
        reportedMime = null,
        tempPath,
        // Phase 299 (#265): optional client-derived-variant contract, threaded straight through to
        // storeOptimizedImageAsset -- see that function's own docs for what each does. All inert
        // when omitted, so every pre-existing caller is unaffected.
        sourceMimeHint = null,
        acceptedAsClientLarge = false,
        clientVariantFiles = null
    }) {
        if (!tempPath) {
            throw new Error('Temporary file path is required');
        }

        const tenantId = dbStore.getStore()?.tenantId || 'default';
        const tenantSegment = normalizeTenantSegment(tenantId);
        return storeOptimizedImageAsset({
            uploadsRoot: UPLOADS_ROOT,
            surfaceFolder: 'pos-catalog',
            scopeSegments: [tenantSegment],
            assetBaseName: `item-${itemId}`,
            originalName,
            reportedMime,
            tempPath,
            // POS terminals stay capped -- unchanged (#265 epic, Phase 299 scope decision: keyed
            // off which storage module handles the call, not a new client-sent signal).
            retainOriginal: false,
            sourceMimeHint,
            acceptedAsClientLarge,
            clientVariantFiles
        });
    },

    async remove({ path: storedPath }) {
        if (!storedPath) return;
        await removeOptimizedImageAsset({ uploadsRoot: UPLOADS_ROOT, storedPath });
    }
});

export const posCatalogImageStorage = createLocalPosCatalogImageStorage();
export const createPosCatalogImageStorage = createLocalPosCatalogImageStorage;
