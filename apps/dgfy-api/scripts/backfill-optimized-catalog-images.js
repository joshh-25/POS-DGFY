import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Tenant, sequelize as landlordSequelize } from '../src/models/index.js';
import {
    storeOptimizedImageAsset
} from '../src/modules/shared/utils/imageAssetStorage.js';
import tenantConnector from '../src/utils/TenantConnector.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const UPLOADS_ROOT = path.resolve(__dirname, '..', 'uploads');
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp']);
const MIME_BY_EXTENSION = Object.freeze({
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp'
});

const parseArgs = (argv = process.argv.slice(2)) => {
    const options = {
        tenantId: '',
        apply: false,
        clearMissing: false,
        clearMissingOnly: false,
        printJson: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--tenant-id') {
            options.tenantId = String(argv[index + 1] || '').trim();
            index += 1;
            continue;
        }
        if (arg === '--apply') {
            options.apply = true;
            continue;
        }
        if (arg === '--clear-missing') {
            options.clearMissing = true;
            continue;
        }
        if (arg === '--clear-missing-only') {
            options.clearMissing = true;
            options.clearMissingOnly = true;
            continue;
        }
        if (arg === '--json') {
            options.printJson = true;
        }
    }

    if (!options.tenantId) {
        throw new Error('A single --tenant-id is required');
    }

    return options;
};

const toPlain = (entry) => {
    if (!entry) return null;
    if (typeof entry.get === 'function') return entry.get({ plain: true });
    if (typeof entry.toJSON === 'function') return entry.toJSON();
    return entry;
};

const parseGallery = (value) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const getRelativeUploadPath = ({ storedPath = null, storedUrl = null }) => {
    const directPath = String(storedPath || '').trim();
    let candidate = directPath;

    if (!candidate) {
        const rawUrl = String(storedUrl || '').trim();
        if (!rawUrl) return '';
        try {
            const parsed = /^https?:\/\//i.test(rawUrl)
                ? new URL(rawUrl)
                : new URL(rawUrl, 'http://local.invalid');
            candidate = parsed.pathname;
        } catch {
            candidate = rawUrl;
        }
    }

    const normalized = candidate
        .replace(/\\/g, '/')
        .replace(/^.*\/uploads\//i, '')
        .replace(/^\/+/, '');
    if (!normalized) return '';

    const absolutePath = path.resolve(UPLOADS_ROOT, ...normalized.split('/'));
    const uploadsPrefix = `${UPLOADS_ROOT}${path.sep}`;
    if (absolutePath !== UPLOADS_ROOT && !absolutePath.startsWith(uploadsPrefix)) {
        return '';
    }

    return normalized;
};

const inspectExistingManifest = async (relativePath) => {
    try {
        const manifestPath = path.join(UPLOADS_ROOT, path.dirname(relativePath), 'asset.json');
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        const isResponsiveV2 = Number(manifest?.version || 0) >= 2
            && Boolean(manifest?.formats?.avif)
            && Boolean(manifest?.formats?.webp)
            && Boolean(manifest?.placeholder?.path);

        const expectedPaths = isResponsiveV2
            ? [
                manifest?.placeholder?.path,
                ...['avif', 'webp'].flatMap((format) => ['pos_thumbnail', 'thumbnail', 'medium', 'large']
                    .map((variant) => manifest?.formats?.[format]?.[variant]?.path))
            ].filter(Boolean)
            : [];
        const missingPaths = [];
        for (const assetPath of expectedPaths) {
            const normalizedPath = getRelativeUploadPath({ storedPath: assetPath });
            if (!normalizedPath) {
                missingPaths.push(assetPath);
                continue;
            }
            try {
                await fs.access(path.resolve(UPLOADS_ROOT, ...normalizedPath.split('/')));
            } catch {
                missingPaths.push(normalizedPath);
            }
        }
        return {
            isResponsiveV2,
            isComplete: isResponsiveV2 && missingPaths.length === 0,
            originalPath: String(manifest?.original?.path || '').trim(),
            missingPaths
        };
    } catch {
        return { isResponsiveV2: false, isComplete: false, originalPath: '', missingPaths: [] };
    }
};

const inspectSource = async ({ storedPath, storedUrl }) => {
    const relativePath = getRelativeUploadPath({ storedPath, storedUrl });
    if (!relativePath) {
        return { status: 'skipped', reason: 'not_local_upload' };
    }

    const manifest = await inspectExistingManifest(relativePath);
    if (manifest.isResponsiveV2 && manifest.isComplete) {
        return { status: 'skipped', reason: 'already_responsive_v2', relativePath };
    }

    const sourceRelativePath = getRelativeUploadPath({ storedPath: manifest.originalPath }) || relativePath;
    const extension = path.extname(sourceRelativePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
        return { status: 'skipped', reason: 'unsupported_extension', relativePath: sourceRelativePath };
    }

    const absolutePath = path.resolve(UPLOADS_ROOT, ...sourceRelativePath.split('/'));
    try {
        const stat = await fs.stat(absolutePath);
        if (!stat.isFile()) {
            return { status: 'skipped', reason: 'not_a_file', relativePath: sourceRelativePath };
        }
        return {
            status: 'candidate',
            relativePath: sourceRelativePath,
            absolutePath,
            extension,
            bytes: stat.size,
            repairedIncompleteResponsiveAsset: manifest.isResponsiveV2
        };
    } catch {
        return { status: 'skipped', reason: 'source_missing', relativePath: sourceRelativePath };
    }
};

const buildStoredGalleryEntry = ({ entry, stored }) => ({
    ...entry,
    path: stored.path,
    url: stored.url,
    variants: stored.image_variants,
    original_path: stored.original?.path || null,
    classification: stored.classification || null
});

const optimizeCandidate = async ({
    candidate,
    surfaceFolder,
    tenantId,
    itemId,
    suffix = ''
}) => {
    const temporaryPath = path.join(
        os.tmpdir(),
        `dgfy-image-backfill-${crypto.randomUUID()}${candidate.extension}`
    );
    await fs.copyFile(candidate.absolutePath, temporaryPath);

    try {
        return await storeOptimizedImageAsset({
            uploadsRoot: UPLOADS_ROOT,
            surfaceFolder,
            scopeSegments: [tenantId],
            assetBaseName: `item-${itemId}${suffix}`,
            originalName: path.basename(candidate.relativePath),
            reportedMime: MIME_BY_EXTENSION[candidate.extension],
            tempPath: temporaryPath
        });
    } finally {
        await fs.rm(temporaryPath, { force: true });
    }
};

const createSummary = ({ tenant, apply }) => ({
    mode: apply ? 'apply' : 'dry-run',
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    db_name: tenant.db_name,
    candidates: 0,
    optimized: 0,
    cleared: 0,
    skipped: 0,
    failed: 0,
    source_bytes: 0,
    optimized_large_bytes: 0,
    records: []
});

const recordResult = (summary, result) => {
    summary.records.push(result);
    if (result.status === 'candidate') summary.candidates += 1;
    if (result.status === 'optimized') summary.optimized += 1;
    if (result.status === 'cleared') summary.cleared += 1;
    if (result.status === 'skipped') summary.skipped += 1;
    if (result.status === 'failed') summary.failed += 1;
    summary.source_bytes += Number(result.source_bytes || 0);
    summary.optimized_large_bytes += Number(result.optimized_large_bytes || 0);
};

const processPrimaryImage = async ({
    row,
    type,
    pathField,
    urlField,
    surfaceFolder,
    tenantId,
    apply,
    clearMissing,
    clearMissingOnly,
    summary
}) => {
    const plain = toPlain(row) || {};
    const itemId = plain.item_id;
    const candidate = await inspectSource({
        storedPath: plain[pathField],
        storedUrl: plain[urlField]
    });

    if (candidate.status !== 'candidate') {
        if (apply && clearMissing && candidate.reason === 'source_missing') {
            await row.update({
                [pathField]: null,
                [urlField]: null
            });
            recordResult(summary, {
                type,
                item_id: itemId,
                status: 'cleared',
                reason: 'source_missing',
                source: candidate.relativePath || null
            });
            return null;
        }
        recordResult(summary, {
            type,
            item_id: itemId,
            status: 'skipped',
            reason: candidate.reason,
            source: candidate.relativePath || null
        });
        return null;
    }

    if (!apply) {
        recordResult(summary, {
            type,
            item_id: itemId,
            status: 'candidate',
            source: candidate.relativePath,
            source_bytes: candidate.bytes
        });
        return null;
    }

    if (clearMissingOnly) {
        recordResult(summary, {
            type,
            item_id: itemId,
            status: 'skipped',
            reason: 'clear_missing_only',
            source: candidate.relativePath
        });
        return null;
    }

    try {
        const stored = await optimizeCandidate({
            candidate,
            surfaceFolder,
            tenantId,
            itemId
        });
        await row.update({
            [pathField]: stored.path,
            [urlField]: stored.url
        });
        recordResult(summary, {
            type,
            item_id: itemId,
            status: 'optimized',
            source: candidate.relativePath,
            target: stored.path,
            source_bytes: candidate.bytes,
            optimized_large_bytes: stored.variants?.large?.size || 0
        });
        return stored;
    } catch (error) {
        recordResult(summary, {
            type,
            item_id: itemId,
            status: 'failed',
            source: candidate.relativePath,
            message: error?.message || 'Image optimization failed'
        });
        return null;
    }
};

const processStorefrontGallery = async ({
    row,
    tenantId,
    apply,
    clearMissing,
    clearMissingOnly,
    summary,
    optimizedPrimary
}) => {
    const plain = toPlain(row) || {};
    const gallery = parseGallery(plain.storefront_image_gallery);
    if (gallery.length === 0) return;

    const primaryKey = getRelativeUploadPath({
        storedPath: plain.storefront_image_path,
        storedUrl: plain.storefront_image_url
    });
    const nextGallery = [...gallery];
    let changed = false;

    for (let index = 0; index < gallery.length; index += 1) {
        const entry = gallery[index] || {};
        const entryKey = getRelativeUploadPath({
            storedPath: entry.path,
            storedUrl: entry.url
        });

        if (optimizedPrimary && entryKey && entryKey === primaryKey) {
            nextGallery[index] = buildStoredGalleryEntry({ entry, stored: optimizedPrimary });
            changed = true;
            continue;
        }

        const candidate = await inspectSource({
            storedPath: entry.path,
            storedUrl: entry.url
        });
        if (candidate.status !== 'candidate') {
            if (apply && clearMissing && candidate.reason === 'source_missing') {
                nextGallery[index] = null;
                changed = true;
                recordResult(summary, {
                    type: 'storefront_gallery',
                    item_id: plain.item_id,
                    gallery_index: index,
                    status: 'cleared',
                    reason: 'source_missing',
                    source: candidate.relativePath || null
                });
                continue;
            }
            recordResult(summary, {
                type: 'storefront_gallery',
                item_id: plain.item_id,
                gallery_index: index,
                status: 'skipped',
                reason: candidate.reason,
                source: candidate.relativePath || null
            });
            continue;
        }

        if (!apply) {
            recordResult(summary, {
                type: 'storefront_gallery',
                item_id: plain.item_id,
                gallery_index: index,
                status: 'candidate',
                source: candidate.relativePath,
                source_bytes: candidate.bytes
            });
            continue;
        }

        if (clearMissingOnly) {
            recordResult(summary, {
                type: 'storefront_gallery',
                item_id: plain.item_id,
                gallery_index: index,
                status: 'skipped',
                reason: 'clear_missing_only',
                source: candidate.relativePath
            });
            continue;
        }

        try {
            const stored = await optimizeCandidate({
                candidate,
                surfaceFolder: 'storefront-catalog',
                tenantId,
                itemId: plain.item_id,
                suffix: `-gallery-${index + 1}`
            });
            nextGallery[index] = buildStoredGalleryEntry({ entry, stored });
            changed = true;
            recordResult(summary, {
                type: 'storefront_gallery',
                item_id: plain.item_id,
                gallery_index: index,
                status: 'optimized',
                source: candidate.relativePath,
                target: stored.path,
                source_bytes: candidate.bytes,
                optimized_large_bytes: stored.variants?.large?.size || 0
            });
        } catch (error) {
            recordResult(summary, {
                type: 'storefront_gallery',
                item_id: plain.item_id,
                gallery_index: index,
                status: 'failed',
                source: candidate.relativePath,
                message: error?.message || 'Gallery image optimization failed'
            });
        }
    }

    if (apply && changed) {
        await row.update({ storefront_image_gallery: nextGallery.filter(Boolean) });
    }
};

const processTenant = async ({ tenant, apply, clearMissing, clearMissingOnly }) => {
    const tenantPlain = toPlain(tenant);
    const summary = createSummary({ tenant: tenantPlain, apply });
    const tenantSequelize = await tenantConnector.getConnection(tenantPlain);
    const { PosCatalogOverride, StorefrontCatalogOverride } = getTenantModels(tenantSequelize);

    const storefrontRows = StorefrontCatalogOverride
        ? await StorefrontCatalogOverride.findAll({
            order: [['storefront_catalog_override_id', 'ASC']]
        })
        : [];
    for (const row of storefrontRows) {
        const optimizedPrimary = await processPrimaryImage({
            row,
            type: 'storefront_primary',
            pathField: 'storefront_image_path',
            urlField: 'storefront_image_url',
            surfaceFolder: 'storefront-catalog',
            tenantId: tenantPlain.id,
            apply,
            clearMissing,
            clearMissingOnly,
            summary
        });
        await processStorefrontGallery({
            row,
            tenantId: tenantPlain.id,
            apply,
            clearMissing,
            clearMissingOnly,
            summary,
            optimizedPrimary
        });
    }

    const posRows = PosCatalogOverride
        ? await PosCatalogOverride.findAll({
            order: [['pos_catalog_override_id', 'ASC']]
        })
        : [];
    for (const row of posRows) {
        await processPrimaryImage({
            row,
            type: 'pos_primary',
            pathField: 'pos_image_path',
            urlField: 'pos_image_url',
            surfaceFolder: 'pos-catalog',
            tenantId: tenantPlain.id,
            apply,
            clearMissing,
            clearMissingOnly,
            summary
        });
    }

    return summary;
};

const printSummary = (summary) => {
    console.log('[CatalogImageBackfill] Complete');
    console.log(`mode=${summary.mode}`);
    console.log(`tenantId=${summary.tenant_id}`);
    console.log(`tenantName=${summary.tenant_name}`);
    console.log(`database=${summary.db_name}`);
    console.log(`candidates=${summary.candidates}`);
    console.log(`optimized=${summary.optimized}`);
    console.log(`cleared=${summary.cleared}`);
    console.log(`skipped=${summary.skipped}`);
    console.log(`failed=${summary.failed}`);
    console.log(`sourceBytes=${summary.source_bytes}`);
    console.log(`optimizedLargeBytes=${summary.optimized_large_bytes}`);
    for (const record of summary.records) {
        console.log(JSON.stringify(record));
    }
};

const main = async () => {
    const options = parseArgs();
    const tenant = await Tenant.findByPk(options.tenantId);
    if (!tenant) {
        throw new Error(`Tenant not found: ${options.tenantId}`);
    }

    let summary;
    try {
        summary = await processTenant({
            tenant,
            apply: options.apply,
            clearMissing: options.clearMissing,
            clearMissingOnly: options.clearMissingOnly
        });
    } finally {
        await tenantConnector.closeAll();
        await landlordSequelize.close();
    }

    if (options.printJson) {
        console.log(JSON.stringify(summary, null, 2));
    } else {
        printSummary(summary);
    }

    if (summary.failed > 0) {
        process.exitCode = 1;
    }
};

main().catch(async (error) => {
    console.error('[CatalogImageBackfill] Failed');
    console.error(error?.stack || error?.message || error);
    try {
        await tenantConnector.closeAll();
        await landlordSequelize.close();
    } catch {
        // Best-effort cleanup for fatal startup failures.
    }
    process.exitCode = 1;
});
