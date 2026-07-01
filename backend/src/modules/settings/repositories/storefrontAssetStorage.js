import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dbStore from '../../../utils/dbStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_ROOT = path.resolve(__dirname, '../../../../uploads');
const STOREFRONT_ASSETS_ROOT = path.join(UPLOADS_ROOT, 'storefront-assets');

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

const normalizeExt = (originalName = '') => {
    const ext = path.extname(originalName).toLowerCase();
    const allowed = new Set([
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.bmp',
        '.avif'
    ]);
    return allowed.has(ext) ? ext : '.png';
};

const ensureDirectory = async (directoryPath) => {
    await fs.mkdir(directoryPath, { recursive: true });
};

const resolveStoragePath = (relativePath) => {
    const normalized = String(relativePath || '').replace(/^[/\\]+/, '');
    const absolute = path.resolve(UPLOADS_ROOT, normalized);
    if (!absolute.startsWith(UPLOADS_ROOT)) {
        throw new Error('Invalid storefront asset storage path');
    }
    return absolute;
};

const createLocalStorefrontAssetStorage = () => ({
    async store({ assetType, originalName, tempPath }) {
        const folderSegment = ASSET_TYPE_TO_FOLDER[assetType];
        if (!folderSegment) {
            throw new Error('Unsupported storefront asset type');
        }
        if (!tempPath) {
            throw new Error('Temporary file path is required');
        }

        const tenantId = dbStore.getStore()?.tenantId || 'default';
        const tenantSegment = normalizeTenantSegment(tenantId);
        const ext = normalizeExt(originalName);
        const filename = `${folderSegment}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;

        const tenantFolder = path.join(STOREFRONT_ASSETS_ROOT, tenantSegment);
        await ensureDirectory(tenantFolder);

        const destination = path.join(tenantFolder, filename);
        await fs.rename(tempPath, destination);

        const relativePath = path.posix.join('storefront-assets', tenantSegment, filename);
        return {
            path: relativePath,
            url: `/uploads/${relativePath}`
        };
    },

    async remove({ path: storedPath }) {
        if (!storedPath) return;
        const absolutePath = resolveStoragePath(storedPath);
        try {
            await fs.unlink(absolutePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
});

export const storefrontAssetStorage = createLocalStorefrontAssetStorage();
export const createStorefrontAssetStorage = createLocalStorefrontAssetStorage;
