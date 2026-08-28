import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../../config/logger.js';
import {
    OPTIMIZATION_VERSION_V2,
    inspectImageLifecycleState,
    IMAGE_LIFECYCLE_STATES,
    isExternalImageUrl
} from '../contracts/imageLifecycleContract.js';
import {
    storeOptimizedImageAsset,
    deriveImageAssetVariantUrls
} from '../../shared/utils/imageAssetStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_UPLOADS_ROOT = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

const calculateFileHash = async (filePath) => {
    try {
        const fileBuffer = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch {
        return null;
    }
};

const readResponsiveAssetManifest = async ({ inputPath, uploadsRoot }) => {
    if (!inputPath || !uploadsRoot) return null;

    try {
        const manifestPath = path.join(path.dirname(inputPath), 'asset.json');
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        const largePath = String(manifest?.variants?.large?.path || '').trim();
        if (Number(manifest?.version) !== OPTIMIZATION_VERSION_V2 || !largePath) return null;

        const resolvedLargePath = path.resolve(
            uploadsRoot,
            ...largePath.replace(/\\/g, '/').replace(/^\/+/, '').split('/')
        );
        if (resolvedLargePath !== path.resolve(inputPath)) return null;

        return manifest;
    } catch {
        return null;
    }
};

const buildVariantMetadataFromManifest = (manifest = {}) => ({
    thumbnail: manifest?.variants?.thumbnail || null,
    catalog_card: manifest?.variants?.medium || null,
    checkout: manifest?.variants?.thumbnail || null,
    preview: manifest?.variants?.large || null,
    formats: manifest?.formats || null,
    placeholder: manifest?.placeholder || null
});

const resolveLocalUploadPath = (storedPath, storedUrl, uploadsRoot) => {
    const rawPath = String(storedPath || '').trim();
    if (rawPath) {
        const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
        return path.resolve(uploadsRoot, ...normalized.split('/'));
    }

    const rawUrl = String(storedUrl || '').trim();
    if (!rawUrl || isExternalImageUrl(rawUrl)) return null;

    try {
        const parsed = /^https?:\/\//i.test(rawUrl)
            ? new URL(rawUrl)
            : new URL(rawUrl, 'http://local.invalid');
        const candidate = parsed.pathname.replace(/^\/uploads\//i, '').replace(/^\/+/, '');
        if (!candidate) return null;
        return path.resolve(uploadsRoot, ...candidate.split('/'));
    } catch {
        return null;
    }
};

export const ensureOptimizedItemImage = async ({
    itemId,
    storedPath = null,
    storedUrl = null,
    file = null,
    existingOverride = null,
    tenantId = 'default',
    uploadsRoot = DEFAULT_UPLOADS_ROOT
}) => {
    const normalizedItemId = Number(itemId);
    if (!Number.isInteger(normalizedItemId) || normalizedItemId <= 0) {
        throw new Error('itemId must be a positive integer');
    }

    const lifecycleState = inspectImageLifecycleState({
        storedPath,
        storedUrl,
        metadata: existingOverride,
        file
    });

    if (lifecycleState === IMAGE_LIFECYCLE_STATES.MISSING) {
        return {
            path: null,
            url: null,
            image_fingerprint: null,
            optimization_version: null,
            processing_status: null,
            variant_metadata: null,
            image_variants: null
        };
    }

    if (lifecycleState === IMAGE_LIFECYCLE_STATES.EXTERNAL) {
        return {
            path: null,
            url: storedUrl,
            image_fingerprint: null,
            optimization_version: null,
            processing_status: 'external',
            variant_metadata: null,
            image_variants: null
        };
    }

    // Determine fingerprint of current/incoming asset
    let inputPath = file?.path || null;
    let tempPathCreated = false;

    if (!inputPath) {
        inputPath = resolveLocalUploadPath(storedPath, storedUrl, uploadsRoot);
    }

    const fingerprint = inputPath ? await calculateFileHash(inputPath) : null;

    // Catalog image storage already writes responsive-v2 assets. Treat its
    // manifest as authoritative so a repository save does not recompress the
    // same upload into a second folder and append it as another gallery image.
    const responsiveManifest = !file && inputPath
        ? await readResponsiveAssetManifest({ inputPath, uploadsRoot })
        : null;
    if (responsiveManifest) {
        return {
            path: storedPath,
            url: storedUrl,
            image_fingerprint: fingerprint,
            optimization_version: OPTIMIZATION_VERSION_V2,
            processing_status: 'optimized',
            variant_metadata: buildVariantMetadataFromManifest(responsiveManifest),
            image_variants: deriveImageAssetVariantUrls({ storedPath, storedUrl })
        };
    }

    // Check if unchanged optimized asset
    if (!file && existingOverride) {
        const isAlreadyV2 = Number(existingOverride.optimization_version) === OPTIMIZATION_VERSION_V2;
        const isStatusOptimized = existingOverride.processing_status === 'optimized';
        const matchesFingerprint = fingerprint && existingOverride.image_fingerprint === fingerprint;
        const matchesPath = storedPath && existingOverride.storefront_image_path === storedPath;

        if (isAlreadyV2 && isStatusOptimized && (matchesFingerprint || matchesPath)) {
            logger.info('[ImageLifecycle] Reusing unchanged optimized image asset without recompression', {
                item_id: normalizedItemId,
                fingerprint
            });
            return {
                path: existingOverride.storefront_image_path || storedPath,
                url: existingOverride.storefront_image_url || storedUrl,
                image_fingerprint: existingOverride.image_fingerprint || fingerprint,
                optimization_version: OPTIMIZATION_VERSION_V2,
                processing_status: 'optimized',
                variant_metadata: existingOverride.variant_metadata || null,
                image_variants: deriveImageAssetVariantUrls({
                    storedPath: existingOverride.storefront_image_path || storedPath,
                    storedUrl: existingOverride.storefront_image_url || storedUrl
                })
            };
        }
    }

    // Process legacy or replaced file asset
    if (!inputPath) {
        return {
            path: storedPath || null,
            url: storedUrl || null,
            image_fingerprint: fingerprint,
            optimization_version: null,
            processing_status: 'legacy',
            variant_metadata: null,
            image_variants: deriveImageAssetVariantUrls({ storedPath, storedUrl })
        };
    }

    // Prepare temp file if working from existing local upload
    let sourceTempPath = file?.path || null;
    if (!sourceTempPath) {
        const ext = path.extname(inputPath) || '.png';
        sourceTempPath = path.join(path.dirname(inputPath), `temp-optimize-${Date.now()}${ext}`);
        try {
            await fs.copyFile(inputPath, sourceTempPath);
            tempPathCreated = true;
        } catch (copyError) {
            logger.warn('[ImageLifecycle] Unable to copy source file for optimization; falling back to legacy reference', {
                item_id: normalizedItemId,
                reason: copyError?.message
            });
            return {
                path: storedPath,
                url: storedUrl,
                image_fingerprint: fingerprint,
                optimization_version: null,
                processing_status: 'legacy',
                variant_metadata: null,
                image_variants: deriveImageAssetVariantUrls({ storedPath, storedUrl })
            };
        }
    }

    try {
        const originalName = file?.originalname || path.basename(inputPath);
        const reportedMime = file?.mimetype || 'image/png';

        const stored = await storeOptimizedImageAsset({
            uploadsRoot,
            surfaceFolder: 'storefront-catalog',
            scopeSegments: [tenantId],
            assetBaseName: `item-${normalizedItemId}`,
            originalName,
            reportedMime,
            tempPath: sourceTempPath
        });

        const variant_metadata = {
            thumbnail: stored.variants?.thumbnail || null,
            catalog_card: stored.variants?.medium || null,
            checkout: stored.variants?.thumbnail || null,
            preview: stored.variants?.large || null,
            formats: stored.format_variants || null,
            placeholder: stored.placeholder || null
        };

        return {
            path: stored.path,
            url: stored.url,
            image_fingerprint: fingerprint,
            optimization_version: OPTIMIZATION_VERSION_V2,
            processing_status: 'optimized',
            variant_metadata,
            image_variants: stored.image_variants || deriveImageAssetVariantUrls({ storedPath: stored.path, storedUrl: stored.url })
        };
    } catch (error) {
        logger.error('[ImageLifecycle] Image optimization failed; retaining legacy asset reference', {
            item_id: normalizedItemId,
            reason: error?.message
        });
        return {
            path: storedPath,
            url: storedUrl,
            image_fingerprint: fingerprint,
            optimization_version: null,
            processing_status: 'failed',
            variant_metadata: null,
            image_variants: deriveImageAssetVariantUrls({ storedPath, storedUrl })
        };
    } finally {
        if (tempPathCreated && sourceTempPath) {
            try {
                await fs.unlink(sourceTempPath);
            } catch {
                // Best-effort temp cleanup.
            }
        }
    }
};
