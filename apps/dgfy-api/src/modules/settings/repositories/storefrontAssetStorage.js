import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs/promises';
import dbStore from '../../../utils/dbStore.js';
import {
    removeOptimizedImageAsset,
    storeOptimizedImageAsset
} from '../../shared/utils/imageAssetStorage.js';
import {
    normalizeStorefrontAssetPath,
    normalizeStorefrontAssetUrl
} from '../../shared/utils/storefrontAssetPolicy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_ROOT = path.resolve(__dirname, '../../../../uploads');
const UPLOADS_ROOT_WITH_SEPARATOR = `${UPLOADS_ROOT}${path.sep}`;

const ASSET_TYPE_TO_FOLDER = Object.freeze({
    cover: 'cover',
    profile: 'profile',
    gallery: 'gallery'
});

const normalizeTenantSegment = (value) => {
    const fallback = 'default';
    const raw = String(value || fallback).trim();
    const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
    return sanitized || fallback;
};

const resolveStoredAssetAbsolutePath = ({ storedPath, storedUrl } = {}) => {
    const normalizedPath = normalizeStorefrontAssetPath(storedPath)
        || normalizeStorefrontAssetUrl(storedUrl).replace(/^\/uploads\//, '');
    if (!normalizedPath) return null;

    const absolutePath = path.resolve(UPLOADS_ROOT, normalizedPath);
    if (!absolutePath.startsWith(UPLOADS_ROOT_WITH_SEPARATOR)) return null;
    return absolutePath;
};

const createLocalStorefrontAssetStorage = () => ({
    async store({ assetType, originalName, reportedMime = null, tempPath }) {
        const folderSegment = ASSET_TYPE_TO_FOLDER[assetType];
        if (!folderSegment) {
            throw new Error('Unsupported storefront asset type');
        }
        if (!tempPath) {
            throw new Error('Temporary file path is required');
        }

        const tenantId = dbStore.getStore()?.tenantId || 'default';
        const tenantSegment = normalizeTenantSegment(tenantId);
        return storeOptimizedImageAsset({
            uploadsRoot: UPLOADS_ROOT,
            surfaceFolder: 'storefront-assets',
            scopeSegments: [tenantSegment],
            assetBaseName: `${folderSegment}-${crypto.randomUUID().slice(0, 8)}`,
            originalName,
            reportedMime,
            tempPath
        });
    },

    async remove({ path: storedPath }) {
        if (!storedPath) return;
        await removeOptimizedImageAsset({ uploadsRoot: UPLOADS_ROOT, storedPath });
    },

    async isAvailable({ path: storedPath, url: storedUrl } = {}) {
        const absolutePath = resolveStoredAssetAbsolutePath({ storedPath, storedUrl });
        if (!absolutePath) return false;
        try {
            await fs.access(absolutePath);
            return true;
        } catch {
            return false;
        }
    }
});

export const storefrontAssetStorage = createLocalStorefrontAssetStorage();
export const createStorefrontAssetStorage = createLocalStorefrontAssetStorage;
