import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import logger from '../../../config/logger.js';

export const IMAGE_VARIANT_WIDTHS = Object.freeze({
    thumbnail: 400,
    medium: 1024,
    large: 1920
});

export const MAX_PUBLIC_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_IMAGE_PIXELS = 40 * 1024 * 1024;
const PHOTO_QUALITY_STEPS = Object.freeze([80, 76, 72, 68]);
/**
 * @deprecated AVIF dropped from the active upload pipeline as of Phase 296 (#265) --
 * getDeliveryFormats() no longer requests the 'avif' format, so this constant is unreferenced
 * from the default encode path. Kept for potential future reactivation or a manual/offline AVIF
 * regeneration tool. Existing v2 assets' .avif files on disk continue to be served unaffected --
 * see the assetVersion <= 2 gate in deriveImageAssetVariantUrls.
 */
const AVIF_QUALITY_STEPS = Object.freeze([65, 60, 55, 50]);
const GRAPHIC_QUALITY_STEPS = Object.freeze([100, 90, 80]);
const RESPONSIVE_ASSET_VERSION = 3;
const PLACEHOLDER_WIDTH = 32;

// Matches the per-asset optimized-variant folder suffix this module has ever produced --
// `-v<N>-<8-hex-hash>`, e.g. `-v2-a1b2c3d4` or `-v3-a1b2c3d4`. Capturing group 1 is the parsed
// asset version. Single source of truth for both deriveImageAssetVariantUrls (URL derivation)
// and removeOptimizedImageAsset (delete-path folder recognition) -- see the #1379/#871 comment
// below on why these two must never drift apart again.
const RESPONSIVE_ASSET_FOLDER_PATTERN = /-v(\d+)-[0-9a-f]{8}$/i;

const IMAGE_VARIANT_FILE_NAMES = Object.freeze({
    thumbnail: 'thumb',
    medium: 'medium',
    large: 'large'
});

const GRAPHIC_MIME_TYPES = new Set(['image/png', 'image/bmp', 'image/gif']);
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/webp', 'image/avif']);

const sanitizeSegment = (value, fallback = 'asset') => {
    const raw = String(value || fallback).trim();
    const normalized = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 120);
    return normalized || fallback;
};

const toPosixRelative = (relativePath) => String(relativePath || '').split(path.sep).join(path.posix.sep);

const fileExists = async (targetPath) => {
    try {
        await fsPromises.access(targetPath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
};

const getOriginalExtension = ({ originalName, reportedMime }) => {
    const originalExt = String(path.extname(originalName || '') || '').trim().toLowerCase();
    if (originalExt) return originalExt;
    switch (String(reportedMime || '').trim().toLowerCase()) {
        case 'image/jpeg':
            return '.jpg';
        case 'image/webp':
            return '.webp';
        case 'image/avif':
            return '.avif';
        case 'image/bmp':
            return '.bmp';
        case 'image/gif':
            return '.gif';
        default:
            return '.png';
    }
};

/**
 * Classifies an uploaded image as 'photo' or 'graphic' to pick the public fallback encoder
 * (webp vs png-family). Precedence: sourceMimeHint -> metadata alpha heuristic -> reportedMime
 * (this last step is today's entire behavior, unchanged when the two new params are omitted).
 *
 * sourceMimeHint and metadata are both optional and NOT wired into storeOptimizedImageAsset's own
 * call site in this PR (Phase 296, #265) -- that wiring is Phase 297's job, once the client starts
 * sending its own re-encoded MIME type and a pre-fetched sharp metadata() object. Added now so
 * Phase 297 is a caller-side change, not new classification logic.
 *
 * @param {object} params
 * @param {string} [params.reportedMime] - the sniffed/reported MIME of the file actually being
 *   encoded (today: always the original upload's own MIME).
 * @param {string|null} [params.sourceMimeHint] - the *pre-conversion* MIME the client claims the
 *   user's original file had, before any client-side re-encoding. Highest precedence: once wired
 *   (Phase 297), this is what keeps a client-converted-to-WebP PNG logo from being misclassified.
 *   Untrusted hint, not a security boundary -- an unrecognized value is ignored, never throws.
 * @param {{hasAlpha?: boolean}|null} [params.metadata] - an already-fetched sharp metadata()
 *   result for the file being encoded (not fetched by this function -- keeps it pure/sync and
 *   avoids a second redundant metadata() disk read; storeOptimizedImageAsset already fetches one
 *   at line ~263). When hasAlpha is true, promotes an otherwise photo-classified MIME (namely
 *   image/webp, which the client-conversion path will make common) to 'graphic' -- alpha channels
 *   are a strong graphic/logo signal a JPEG-only classifier can't see. Never demotes an
 *   already-graphic MIME back to 'photo'.
 * @returns {'photo'|'graphic'}
 */
export const classifyImageAsset = ({ reportedMime, sourceMimeHint = null, metadata = null } = {}) => {
    const normalizedHint = String(sourceMimeHint || '').trim().toLowerCase();
    if (PHOTO_MIME_TYPES.has(normalizedHint)) return 'photo';
    if (GRAPHIC_MIME_TYPES.has(normalizedHint)) return 'graphic';

    if (metadata && metadata.hasAlpha === true) return 'graphic';

    const normalizedMime = String(reportedMime || '').trim().toLowerCase();
    if (PHOTO_MIME_TYPES.has(normalizedMime)) return 'photo';
    if (GRAPHIC_MIME_TYPES.has(normalizedMime)) return 'graphic';
    return 'graphic';
};

const getPublicFormat = ({ classification }) => (
    classification === 'photo'
        ? { ext: '.webp', encoder: 'webp' }
        : { ext: '.png', encoder: 'png' }
);

const getDeliveryFormats = ({ classification }) => {
    const fallback = getPublicFormat({ classification });
    const formats = new Map([[fallback.encoder, fallback]]);
    formats.set('webp', { ext: '.webp', encoder: 'webp' });
    return Array.from(formats.values());
};

const getSafeImageInput = (sourcePath) => sharp(sourcePath, {
    limitInputPixels: MAX_INPUT_IMAGE_PIXELS,
    failOn: 'error'
});

const getCandidateWidths = ({ width, sourceWidth }) => {
    const maximumWidth = Number.isFinite(sourceWidth) && sourceWidth > 0
        ? Math.min(width, sourceWidth)
        : width;
    const candidates = [maximumWidth];
    let currentWidth = maximumWidth;

    while (currentWidth > 640) {
        currentWidth = Math.max(640, Math.floor(currentWidth * 0.8));
        candidates.push(currentWidth);
        if (currentWidth === 640) break;
    }

    return [...new Set(candidates.filter((candidate) => Number.isFinite(candidate) && candidate > 0))];
};

const buildVariantOutput = async ({
    sourcePath,
    destinationPath,
    encoder,
    width,
    sourceWidth,
    maxBytes = null
}) => {
    const candidateWidths = maxBytes
        ? getCandidateWidths({ width, sourceWidth })
        : [width];
    const qualitySteps = encoder === 'webp'
        ? PHOTO_QUALITY_STEPS
        : encoder === 'avif'
            ? AVIF_QUALITY_STEPS
            : GRAPHIC_QUALITY_STEPS;

    let attempts = 0;
    for (const candidateWidth of candidateWidths) {
        for (const quality of qualitySteps) {
            attempts += 1;
            const transform = getSafeImageInput(sourcePath).rotate();
            if (Number.isFinite(candidateWidth) && candidateWidth > 0) {
                transform.resize({ width: candidateWidth, fit: 'inside', withoutEnlargement: true });
            } else {
                transform.resize({ fit: 'inside', withoutEnlargement: true });
            }

            if (encoder === 'webp') {
                transform.webp({ quality, effort: 5 });
            // @deprecated -- unreachable from the default upload path as of Phase 296 (#265); see
            // AVIF_QUALITY_STEPS above. Retained only for potential future reactivation or a
            // manual/offline AVIF regeneration tool.
            } else if (encoder === 'avif') {
                transform.avif({ quality, effort: 5 });
            } else {
                transform.png({ compressionLevel: 9, palette: true, quality });
            }

            const outputInfo = await transform.toFile(destinationPath);
            const output = {
                width: Number.isFinite(outputInfo?.width) ? outputInfo.width : null,
                height: Number.isFinite(outputInfo?.height) ? outputInfo.height : null,
                size: Number.isFinite(outputInfo?.size) ? outputInfo.size : null
            };

            if (!maxBytes || output.size <= maxBytes) {
                return { ...output, attempts };
            }
        }
    }

    throw new Error(`Unable to optimize image below ${maxBytes} bytes`);
};

const buildPublicUrl = (relativePath) => `/uploads/${toPosixRelative(relativePath)}`;

/**
 * Derives the medium/thumbnail delivery variants for a set of formats from an already-accepted
 * `large` file on disk, instead of re-deriving from the original source image. Not wired into
 * storeOptimizedImageAsset in this PR -- Phase 297 (#265) is expected to call this once a
 * client-supplied `large` variant has already passed validation, so the server can skip
 * re-encoding from the original entirely for that request.
 *
 * Mirrors storeOptimizedImageAsset's own per-format/per-variant loop (lines ~268-298) exactly,
 * scoped to non-large variant keys only -- deliberately close to that loop rather than a generic
 * abstraction the two share, since reconciling them into one shared loop is Phase 297's wiring
 * job, not this PR's.
 *
 * @param {object} params
 * @param {string} params.acceptedLargePath - absolute path to the already-accepted `large` file.
 * @param {string} params.publicAssetDir - absolute directory to write the derived files into
 *   (the same per-asset directory the `large` file itself already lives in).
 * @param {string} params.normalizedSurface - matches storeOptimizedImageAsset's own sanitized
 *   surface segment, for building the returned relative URL paths.
 * @param {string[]} [params.normalizedScopeSegments] - matches storeOptimizedImageAsset's own
 *   sanitized scope segments.
 * @param {string} params.assetId - the asset folder name (e.g. `item-10-<ts>-v3-<hash>`).
 * @param {Array<{ext: string, encoder: string}>} params.deliveryFormats - result of
 *   getDeliveryFormats({ classification }); same shape storeOptimizedImageAsset already builds.
 * @param {number|null} [params.sourceWidth] - width of the accepted large file, if already known
 *   (avoids a redundant metadata() read); buildVariantOutput never upscales regardless.
 * @param {('medium'|'thumbnail')[]} [params.variantKeys] - which non-large variants to derive.
 *   Defaults to both. A 'large' entry, if ever passed, is silently skipped (this function only
 *   derives *from* an accepted large, it never re-derives large itself).
 * @returns {Promise<Record<string, Record<string, {path: string, url: string, width: number|null,
 *   height: number|null, size: number|null, mime: string}>>>} a generatedByFormat-shaped map
 *   (same shape as storeOptimizedImageAsset's own `generatedByFormat`), containing only the
 *   requested variantKeys.
 */
export const deriveVariantsFromAcceptedLarge = async ({
    acceptedLargePath,
    publicAssetDir,
    normalizedSurface,
    normalizedScopeSegments = [],
    assetId,
    deliveryFormats,
    sourceWidth = null,
    variantKeys = ['medium', 'thumbnail']
}) => {
    if (!acceptedLargePath || !publicAssetDir || !assetId || !Array.isArray(deliveryFormats)) {
        throw new Error('acceptedLargePath, publicAssetDir, assetId, and deliveryFormats are required');
    }

    const generatedByFormat = {};
    for (const format of deliveryFormats) {
        generatedByFormat[format.encoder] = {};
        for (const variantKey of variantKeys) {
            const width = IMAGE_VARIANT_WIDTHS[variantKey];
            if (!width) continue; // guards a 'large' or unrecognized key in variantKeys
            const variantFilename = `${IMAGE_VARIANT_FILE_NAMES[variantKey]}${format.ext}`;
            const variantRelativePath = path.posix.join(
                normalizedSurface,
                ...normalizedScopeSegments.map((segment) => toPosixRelative(segment)),
                assetId,
                variantFilename
            );
            const variantAbsolutePath = path.join(publicAssetDir, variantFilename);
            const output = await buildVariantOutput({
                sourcePath: acceptedLargePath,
                destinationPath: variantAbsolutePath,
                encoder: format.encoder,
                width,
                sourceWidth
            });
            generatedByFormat[format.encoder][variantKey] = {
                path: variantRelativePath,
                url: buildPublicUrl(variantRelativePath),
                width: output.width,
                height: output.height,
                size: output.size,
                mime: `image/${format.encoder}`
            };
        }
    }
    return generatedByFormat;
};

export const deriveImageAssetVariantUrls = ({ storedPath = null, storedUrl = null } = {}) => {
    const relative = String(storedPath || '').trim()
        || (() => {
            const rawUrl = String(storedUrl || '').trim();
            if (!rawUrl) return '';
            const withoutOrigin = rawUrl.replace(/^https?:\/\/[^/]+/i, '');
            const withoutUploadsPrefix = withoutOrigin.startsWith('/uploads/')
                ? withoutOrigin.slice('/uploads/'.length)
                : withoutOrigin.replace(/^\/+/, '');
            return withoutUploadsPrefix;
        })();

    if (!relative) {
        return {
            thumbnail_url: null,
            medium_url: null,
            large_url: null
        };
    }

    const normalized = toPosixRelative(relative);
    const extension = path.posix.extname(normalized);
    const basename = path.posix.basename(normalized, extension);
    if (!Object.values(IMAGE_VARIANT_FILE_NAMES).includes(basename)) {
        const url = storedUrl || buildPublicUrl(normalized);
        return {
            thumbnail_url: url,
            medium_url: url,
            large_url: url
        };
    }

    const parentDir = path.posix.dirname(normalized);
    const assetFolder = path.posix.basename(parentDir);
    const responsiveAssetMatch = RESPONSIVE_ASSET_FOLDER_PATTERN.exec(assetFolder);
    const isResponsiveAsset = Boolean(responsiveAssetMatch);
    const assetVersion = responsiveAssetMatch ? Number(responsiveAssetMatch[1]) : null;
    const buildUrlForVariant = (variantKey, targetExtension = extension) => buildPublicUrl(path.posix.join(
        parentDir,
        `${IMAGE_VARIANT_FILE_NAMES[variantKey]}${targetExtension}`
    ));

    const fallbackVariants = {
        thumbnail_url: buildUrlForVariant('thumbnail'),
        medium_url: buildUrlForVariant('medium'),
        large_url: buildUrlForVariant('large')
    };
    if (!isResponsiveAsset) return fallbackVariants;

    const buildFormatVariants = (targetExtension) => ({
        thumbnail_url: buildUrlForVariant('thumbnail', targetExtension),
        medium_url: buildUrlForVariant('medium', targetExtension),
        large_url: buildUrlForVariant('large', targetExtension)
    });

    const responsiveVariants = {
        ...fallbackVariants,
        placeholder_url: buildPublicUrl(path.posix.join(parentDir, 'placeholder.webp')),
        webp: buildFormatVariants('.webp'),
        widths: { ...IMAGE_VARIANT_WIDTHS },
        version: assetVersion // Finding 3: parsed version, not the module constant
    };
    if (assetVersion <= 2) {
        responsiveVariants.avif = buildFormatVariants('.avif');
    }
    return responsiveVariants;
};

export const storeOptimizedImageAsset = async ({
    uploadsRoot,
    surfaceFolder,
    scopeSegments = [],
    assetBaseName = 'asset',
    originalName,
    reportedMime,
    tempPath,
    retainOriginal = true
}) => {
    if (!uploadsRoot || !surfaceFolder || !tempPath) {
        throw new Error('uploadsRoot, surfaceFolder, and tempPath are required');
    }

    const wallStart = Date.now();
    const cpuStart = process.cpuUsage();
    let encodeCount = 0;

    const normalizedSurface = sanitizeSegment(surfaceFolder, 'assets');
    const normalizedScopeSegments = (Array.isArray(scopeSegments) ? scopeSegments : [])
        .map((segment) => sanitizeSegment(segment, 'default'))
        .filter(Boolean);
    const assetId = `${sanitizeSegment(assetBaseName)}-${Date.now()}-v${RESPONSIVE_ASSET_VERSION}-${crypto.randomUUID().slice(0, 8)}`;
    const publicAssetDir = path.join(uploadsRoot, normalizedSurface, ...normalizedScopeSegments, assetId);
    const originalAssetDir = path.join(uploadsRoot, 'originals', normalizedSurface, ...normalizedScopeSegments, assetId);
    await fsPromises.mkdir(publicAssetDir, { recursive: true });
    await fsPromises.mkdir(originalAssetDir, { recursive: true });

    try {
        const classification = classifyImageAsset({ reportedMime });
        const { encoder } = getPublicFormat({ classification });
        const deliveryFormats = getDeliveryFormats({ classification });
        const originalExt = getOriginalExtension({ originalName, reportedMime });
        const originalFilename = `original${originalExt}`;
        const originalAbsolutePath = path.join(originalAssetDir, originalFilename);
        await fsPromises.rename(tempPath, originalAbsolutePath);

        const originalMeta = await getSafeImageInput(originalAbsolutePath).metadata();
        const originalStat = await fsPromises.stat(originalAbsolutePath);
        const sourceWidth = Number.isFinite(originalMeta?.width) ? originalMeta.width : null;
        const sourceHeight = Number.isFinite(originalMeta?.height) ? originalMeta.height : null;

        const generatedByFormat = {};
        for (const format of deliveryFormats) {
            generatedByFormat[format.encoder] = {};
            for (const [variantKey, width] of Object.entries(IMAGE_VARIANT_WIDTHS)) {
                const variantFilename = `${IMAGE_VARIANT_FILE_NAMES[variantKey]}${format.ext}`;
                const variantRelativePath = path.posix.join(
                    normalizedSurface,
                    ...normalizedScopeSegments.map((segment) => toPosixRelative(segment)),
                    assetId,
                    variantFilename
                );
                const variantAbsolutePath = path.join(publicAssetDir, variantFilename);
                const output = await buildVariantOutput({
                    sourcePath: originalAbsolutePath,
                    destinationPath: variantAbsolutePath,
                    encoder: format.encoder,
                    width,
                    sourceWidth,
                    maxBytes: variantKey === 'large' ? MAX_PUBLIC_IMAGE_BYTES : null
                });
                encodeCount += output.attempts;
                generatedByFormat[format.encoder][variantKey] = {
                    path: variantRelativePath,
                    url: buildPublicUrl(variantRelativePath),
                    width: output.width,
                    height: output.height,
                    size: output.size,
                    mime: `image/${format.encoder}`
                };
            }
        }

        const placeholderFilename = 'placeholder.webp';
        const placeholderRelativePath = path.posix.join(
            normalizedSurface,
            ...normalizedScopeSegments.map((segment) => toPosixRelative(segment)),
            assetId,
            placeholderFilename
        );
        const placeholderOutput = await buildVariantOutput({
            sourcePath: originalAbsolutePath,
            destinationPath: path.join(publicAssetDir, placeholderFilename),
            encoder: 'webp',
            width: PLACEHOLDER_WIDTH,
            sourceWidth
        });
        encodeCount += placeholderOutput.attempts;

        const generatedVariants = generatedByFormat[encoder];

        const largeVariant = generatedVariants.large;
        if (!largeVariant?.path || !largeVariant?.url) {
            throw new Error('Large image variant was not generated');
        }

        const originalPath = retainOriginal
            ? toPosixRelative(path.relative(uploadsRoot, originalAbsolutePath))
            : null;
        const manifest = {
            version: RESPONSIVE_ASSET_VERSION,
            asset_id: assetId,
            surface: normalizedSurface,
            scope_segments: normalizedScopeSegments,
            classification,
            original: {
                path: originalPath,
                retained: Boolean(retainOriginal),
                filename: originalFilename,
                mime: String(reportedMime || '').trim().toLowerCase() || null,
                width: sourceWidth,
                height: sourceHeight,
                size: Number.isFinite(originalStat?.size) ? originalStat.size : null
            },
            variants: generatedVariants,
            formats: generatedByFormat,
            placeholder: {
                path: placeholderRelativePath,
                url: buildPublicUrl(placeholderRelativePath),
                width: placeholderOutput.width,
                height: placeholderOutput.height,
                size: placeholderOutput.size,
                mime: 'image/webp'
            }
        };
        const manifestPath = path.join(publicAssetDir, 'asset.json');
        await fsPromises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

        if (!retainOriginal) {
            await fsPromises.rm(originalAssetDir, { recursive: true, force: true });
        }

        const cpuDelta = process.cpuUsage(cpuStart);
        logger.info('[ImageAssetStorage] storeOptimizedImageAsset completed', {
            asset_id: assetId,
            classification,
            source_bytes: manifest.original.size,
            source_w: sourceWidth,
            source_h: sourceHeight,
            encode_count: encodeCount,
            wall_ms: Date.now() - wallStart,
            cpu_ms: Math.round((cpuDelta.user + cpuDelta.system) / 1000)
        });

        return {
            path: largeVariant.path,
            url: largeVariant.url,
            variants: {
                thumbnail: generatedVariants.thumbnail,
                medium: generatedVariants.medium,
                large: generatedVariants.large
            },
            format_variants: generatedByFormat,
            placeholder: manifest.placeholder,
            image_variants: deriveImageAssetVariantUrls({
                storedPath: largeVariant.path,
                storedUrl: largeVariant.url
            }),
            original: {
                path: manifest.original.path,
                url: null,
                width: manifest.original.width,
                height: manifest.original.height,
                size: manifest.original.size,
                mime: manifest.original.mime
            },
            classification
        };
    } catch (error) {
        await fsPromises.rm(publicAssetDir, { recursive: true, force: true });
        await fsPromises.rm(originalAssetDir, { recursive: true, force: true });
        throw error;
    }
};

export const removeOptimizedImageAsset = async ({ uploadsRoot, storedPath }) => {
    if (!uploadsRoot || !storedPath) return;

    const normalized = String(storedPath || '').replace(/^[/\\]+/, '');
    const absolute = path.resolve(uploadsRoot, normalized);
    const uploadsRootWithSeparator = `${uploadsRoot}${path.sep}`;
    if (absolute !== uploadsRoot && !absolute.startsWith(uploadsRootWithSeparator)) {
        throw new Error('Invalid optimized image asset path');
    }

    const relativeDir = path.dirname(normalized);
    const assetFolderAbsolute = path.resolve(uploadsRoot, relativeDir);
    const assetFolderRelative = toPosixRelative(relativeDir);
    // #1379/#871: `relativeDir` is only safe to recurse into when it is a real
    // per-asset optimized-variant folder (`<base>-<ts>-v<N>-<hash>/`), the same
    // shape `deriveImageAssetVariantUrls` above already recognizes. For a
    // legacy flat path (`<surface>/<tenant>/item-41-<ts>.jpg`), `relativeDir`
    // resolves to the tenant's *entire* catalog directory -- recursing there
    // deleted every image for that tenant (confirmed live in production,
    // 2026-09-01/02). A legacy path must only ever unlink the single file.
    const assetFolderName = path.posix.basename(assetFolderRelative);
    const isResponsiveAssetFolder = RESPONSIVE_ASSET_FOLDER_PATTERN.test(assetFolderName);
    const assetFolderExists = isResponsiveAssetFolder && await fileExists(assetFolderAbsolute);
    if (assetFolderExists) {
        await fsPromises.rm(assetFolderAbsolute, { recursive: true, force: true });
    } else {
        try {
            await fsPromises.unlink(absolute);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    const assetFolderParts = assetFolderRelative.split('/').filter(Boolean);
    if (isResponsiveAssetFolder && assetFolderParts.length >= 2) {
        const originalFolderAbsolute = path.join(uploadsRoot, 'originals', ...assetFolderParts);
        if (await fileExists(originalFolderAbsolute)) {
            await fsPromises.rm(originalFolderAbsolute, { recursive: true, force: true });
        }
    }
};
