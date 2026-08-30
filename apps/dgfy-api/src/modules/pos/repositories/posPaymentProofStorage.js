import crypto from 'crypto';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import dbStore from '../../../utils/dbStore.js';

// Phase 204 (#965): a private, tenant-scoped store for balance-settlement proof-of-payment
// images -- financial-evidence PII (bank/cheque details may be visible). Structured on
// platformInvoiceArtifactStore.js's traversal guard and integrity check, plus
// posCatalogImageStorage.js's tenant-segment sanitization. Deliberately NOT built on
// imageAssetStorage.js's storeOptimizedImageAsset: that writer hardcodes `/uploads/...` public
// URLs and would republish this PII through server.js's unauthenticated static mount -- exactly
// what Pat's decision on #965 forbids. See PHASE_204_PLAN.md section 3 for the full rationale.
const ROOT = () => path.resolve(process.env.POS_PAYMENT_PROOF_ROOT
    || path.join(process.cwd(), 'storage', 'pos-payment-proofs'));

const safePath = (storageKey) => {
    const root = ROOT();
    const resolved = path.resolve(root, storageKey);
    if (!resolved.startsWith(`${root}${path.sep}`)) {
        throw new Error('Invalid balance-payment proof storage key.');
    }
    return resolved;
};

const normalizeTenantSegment = (value) => {
    const fallback = 'default';
    const raw = String(value || fallback).trim();
    const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
    return sanitized || fallback;
};

const PROOF_CONTENT_TYPE = 'image/webp';
const PROOF_WEBP_QUALITY = 82;
const PROOF_MAX_DIMENSION = 2000;

export const posPaymentProofStorage = {
    // Legibility is the functional requirement here, not compression (PHASE_204_PLAN.md 1.2.3):
    // `.rotate()` applies then discards EXIF orientation, no `.withMetadata()` so GPS/device EXIF
    // is dropped (1.2.4), a single capped-dimension WebP variant -- never the multi-variant/
    // multi-quality-step ladder imageAssetStorage.js runs for catalog photos.
    async store({ orderId, tempPath }) {
        if (!tempPath) {
            throw new Error('Temporary file path is required.');
        }

        const tenantId = dbStore.getStore()?.tenantId || 'default';
        const tenantSegment = normalizeTenantSegment(tenantId);
        const storageKey = path.posix.join(tenantSegment, String(orderId), `${crypto.randomUUID()}.webp`);
        const target = safePath(storageKey);
        await fs.mkdir(path.dirname(target), { recursive: true });

        const buffer = await sharp(tempPath)
            .rotate()
            .resize({ width: PROOF_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: PROOF_WEBP_QUALITY })
            .toBuffer();
        // wx: never silently overwrite -- the UUID filename should never collide, and a collision
        // would mean something is wrong worth failing loud on.
        await fs.writeFile(target, buffer, { flag: 'wx' });

        return {
            storage_key: storageKey,
            mime_type: PROOF_CONTENT_TYPE,
            size_bytes: buffer.length,
            sha256: crypto.createHash('sha256').update(buffer).digest('hex')
        };
    },

    async read(storageKey) {
        return fs.readFile(safePath(storageKey));
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
