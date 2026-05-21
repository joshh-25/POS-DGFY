import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dbStore from '../../../utils/dbStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, '../../../../uploads');
const STOREFRONT_CATALOG_ROOT = path.join(UPLOADS_ROOT, 'storefront-catalog');

const normalizeTenantSegment = (value) => {
    const fallback = 'default';
    const raw = String(value || fallback).trim();
    const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
    return sanitized || fallback;
};

const normalizeExt = (originalName = '') => {
    const ext = path.extname(originalName).toLowerCase();
    const allowed = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);
    return allowed.has(ext) ? ext : '.png';
};

const resolveStoragePath = (relativePath) => {
    const normalized = String(relativePath || '').replace(/^[/\\]+/, '');
    const absolute = path.resolve(UPLOADS_ROOT, normalized);
    const uploadsRootWithSeparator = `${UPLOADS_ROOT}${path.sep}`;
    if (absolute !== UPLOADS_ROOT && !absolute.startsWith(uploadsRootWithSeparator)) {
        throw new Error('Invalid storefront catalog image path');
    }
    return absolute;
};

const createLocalStorefrontCatalogImageStorage = () => ({
    async store({ itemId, originalName, tempPath }) {
        if (!tempPath) {
            throw new Error('Temporary file path is required');
        }

        const tenantId = dbStore.getStore()?.tenantId || 'default';
        const tenantSegment = normalizeTenantSegment(tenantId);
        const ext = normalizeExt(originalName);
        const filename = `item-${itemId}-${Date.now()}${ext}`;

        const tenantFolder = path.join(STOREFRONT_CATALOG_ROOT, tenantSegment);
        await fs.mkdir(tenantFolder, { recursive: true });

        const destination = path.join(tenantFolder, filename);
        await fs.rename(tempPath, destination);

        const relativePath = path.posix.join('storefront-catalog', tenantSegment, filename);
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

export const storefrontCatalogImageStorage = createLocalStorefrontCatalogImageStorage();
export const createStorefrontCatalogImageStorage = createLocalStorefrontCatalogImageStorage;
