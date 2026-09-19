import crypto from 'crypto';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import dbStore from '../../../utils/dbStore.js';

// Phase 330 (#1460): packing evidence is operational PII and must stay outside every public
// static root. The storage key is tenant/order/UUID only; original filenames never reach disk.
const ROOT = () => path.resolve(process.env.POS_PACKING_EVIDENCE_ROOT
    || path.join(process.cwd(), 'storage', 'pos-packing-evidence'));

const safePath = (storageKey) => {
    const root = ROOT();
    const resolved = path.resolve(root, storageKey);
    if (!resolved.startsWith(`${root}${path.sep}`)) {
        throw new Error('Invalid packing evidence storage key.');
    }
    return resolved;
};

const normalizeTenantSegment = (value) => {
    const raw = String(value || 'default').trim();
    const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
    return sanitized || 'default';
};

const CONTENT_TYPE = 'image/webp';
const WEBP_QUALITY = 82;
const MAX_DIMENSION = 2000;

export const posPackingEvidenceStorage = {
    async store({ orderId, tempPath, imageId = crypto.randomUUID() }) {
        if (!tempPath) throw new Error('Temporary file path is required.');
        const normalizedImageId = String(imageId || '').trim();
        if (!/^[0-9a-f-]{36}$/i.test(normalizedImageId)) {
            throw new Error('A valid packing evidence image id is required.');
        }

        const tenantSegment = normalizeTenantSegment(dbStore.getStore()?.tenantId || 'default');
        const storageKey = path.posix.join(tenantSegment, String(orderId), `${normalizedImageId}.webp`);
        const target = safePath(storageKey);
        await fs.mkdir(path.dirname(target), { recursive: true });

        const buffer = await sharp(tempPath)
            .rotate()
            .resize({ width: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .toBuffer();
        await fs.writeFile(target, buffer, { flag: 'wx' });

        return {
            storage_key: storageKey,
            mime_type: CONTENT_TYPE,
            size_bytes: buffer.length,
            sha256: crypto.createHash('sha256').update(buffer).digest('hex')
        };
    },

    createReadStream(storageKey) {
        return fsSync.createReadStream(safePath(storageKey));
    },

    async remove(storageKey) {
        if (!storageKey) return;
        await fs.unlink(safePath(storageKey)).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
        });
    }
};
