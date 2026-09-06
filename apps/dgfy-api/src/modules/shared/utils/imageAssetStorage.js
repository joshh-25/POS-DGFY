import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import logger from '../../../config/logger.js';
import { MAX_INPUT_IMAGE_PIXELS, validateClientVariant } from './imageUploadValidation.js';

export const IMAGE_VARIANT_WIDTHS = Object.freeze({
    pos_thumbnail: 144,
    thumbnail: 400,
    medium: 1024,
    large: 1920
});

export const MAX_PUBLIC_IMAGE_BYTES = 10 * 1024 * 1024;
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
    pos_thumbnail: 'pos-thumb',
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
 * sourceMimeHint and metadata were added in Phase 296 (#265) but left unwired -- storeOptimizedImageAsset
 * still called this with only `reportedMime` at that point. Phase 301 (#265) is the wiring: metadata
 * is now fetched before this call (not after -- see storeOptimizedImageAsset's own history) and
 * `sourceMimeHint` is threaded through from the client's optional manifest.
 *
 * @param {object} params
 * @param {string} [params.reportedMime] - the sniffed/reported MIME of the file actually being
 *   encoded (today: always the original upload's own MIME).
 * @param {string|null} [params.sourceMimeHint] - the *pre-conversion* MIME the client claims the
 *   user's original file had, before any client-side re-encoding. Highest precedence: once wired
 *   (Phase 301), this is what keeps a client-converted-to-WebP PNG logo from being misclassified.
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
    variantKey,
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
            if (variantKey === 'pos_thumbnail') {
                transform.resize({ width, height: width, fit: 'cover', position: 'centre' });
            } else if (Number.isFinite(candidateWidth) && candidateWidth > 0) {
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
 * `large` file on disk, instead of re-deriving from the original source image. Wired into
 * storeOptimizedImageAsset as of Phase 301 (#265): called for the primary delivery format's
 * medium/thumbnail keys whenever the client's own `image` upload validates as an already-optimized
 * large (see storeOptimizedImageAsset's `acceptedAsClientLarge` param) and the client did not
 * separately supply its own validated medium/thumbnail files for those specific keys.
 *
 * Mirrors storeOptimizedImageAsset's own per-format/per-variant loop exactly, scoped to non-large
 * variant keys only -- deliberately close to that loop rather than a generic abstraction the two
 * share, since the two call sites' surrounding bookkeeping (manifest, provenance, placeholder)
 * differ enough that a shared abstraction would add more indirection than it removes.
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
    if (basename === 'pos-thumb') {
        const url = storedUrl || buildPublicUrl(normalized);
        return { pos_thumbnail_url: url, thumbnail_url: url, medium_url: url, large_url: url };
    }
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
    retainOriginal = true,
    // -- Phase 301 (#265) additions, all optional and all inert unless a caller explicitly opts
    // in: an old caller passing none of these gets byte-identical behavior to before this phase.
    sourceMimeHint = null,
    acceptedAsClientLarge = false,
    clientVariantFiles = null,
    // Phase 298 (#265) additions, observability-only: the resolved image_client_conversion mode
    // and scope for this specific request, threaded through purely to be logged below. Optional
    // and inert -- a caller that omits these (any pre-Phase-298 caller) just logs `null` for both.
    imageClientConversionState = null,
    imageClientConversionScope = null
}) => {
    if (!uploadsRoot || !surfaceFolder || !tempPath) {
        throw new Error('uploadsRoot, surfaceFolder, and tempPath are required');
    }

    const wallStart = Date.now();
    const cpuStart = process.cpuUsage();
    let encodeCount = 0;
    // Tracks validated-but-not-yet-copied client variant temp files so a mid-run failure (e.g. an
    // unrelated buildVariantOutput throw) doesn't leak them in TEMP_DIR -- entries are removed as
    // each one is successfully copied into place, and the catch block below sweeps the remainder.
    const pendingClientVariantTempPaths = new Set();

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
        // Reordered as of Phase 301 (#265): the rename + metadata() fetch now happen BEFORE
        // classification, not after -- classifyImageAsset needs `metadata` (its alpha heuristic)
        // and this is the first caller to actually pass it. Before this phase, classification ran
        // on `reportedMime` alone and the metadata fetch below happened afterwards, so `metadata`
        // was never available to feed back into the classify call it was meant to inform.
        const originalExt = getOriginalExtension({ originalName, reportedMime });
        const originalFilename = `original${originalExt}`;
        const originalAbsolutePath = path.join(originalAssetDir, originalFilename);
        await fsPromises.rename(tempPath, originalAbsolutePath);

        const originalMeta = await getSafeImageInput(originalAbsolutePath).metadata();
        const originalStat = await fsPromises.stat(originalAbsolutePath);
        const sourceWidth = Number.isFinite(originalMeta?.width) ? originalMeta.width : null;
        const sourceHeight = Number.isFinite(originalMeta?.height) ? originalMeta.height : null;

        const classification = classifyImageAsset({ reportedMime, sourceMimeHint, metadata: originalMeta });
        const posOnly = normalizedSurface === 'pos-catalog';
        const { encoder } = posOnly ? { encoder: 'webp' } : getPublicFormat({ classification });
        const deliveryFormats = posOnly ? [{ encoder: 'webp', ext: '.webp' }] : getDeliveryFormats({ classification });

        // -- Accepted-large resolution (Phase 301, #265): if the caller flags the just-renamed
        // original as an already-optimized "large" (the client's own `image` field, when the
        // manifest declares it pre-optimized), validate it against the exact contract the server
        // would otherwise have produced -- correct public format, width within the large target
        // (+2px slack), pixel cap, AND the same MAX_PUBLIC_IMAGE_BYTES cap every server-derived
        // large is held to (validateClientVariant itself has no byte-size notion; that check is
        // done here since it's a delivery-size policy, not a decode-correctness one). A failed
        // validation is never an error -- it silently falls through to the classic derivation
        // below, exactly as if the caller had never passed the flag.
        let acceptedLargeValidation = { ok: false };
        if (acceptedAsClientLarge && !posOnly) {
            const candidateValidation = await validateClientVariant({
                file: { path: originalAbsolutePath },
                expectedFormat: encoder,
                targetWidth: IMAGE_VARIANT_WIDTHS.large,
                maxPixels: MAX_INPUT_IMAGE_PIXELS
            });
            const withinDeliveryByteCap = Number.isFinite(originalStat?.size) && originalStat.size <= MAX_PUBLIC_IMAGE_BYTES;
            acceptedLargeValidation = candidateValidation.ok && withinDeliveryByteCap ? candidateValidation : { ok: false };
        }
        const acceptedLargeUsed = acceptedLargeValidation.ok === true;

        // -- Client-supplied medium/thumbnail resolution: independent of the accepted-large
        // outcome above (a client may send image_medium/image_thumbnail even when `image` itself
        // is a raw, un-optimized original). Each candidate is validated on its own; a rejected
        // candidate's temp file is cleaned up immediately rather than left in TEMP_DIR, and the
        // caller falls back to deriving that specific variant server-side.
        const acceptedClientVariants = {};
        if (posOnly) {
            for (const candidate of Object.values(clientVariantFiles || {})) {
                if (candidate?.tempPath) pendingClientVariantTempPaths.add(candidate.tempPath);
            }
        }
        if (!posOnly && clientVariantFiles && typeof clientVariantFiles === 'object') {
            for (const variantKey of ['medium', 'thumbnail']) {
                const candidate = clientVariantFiles[variantKey];
                if (!candidate?.tempPath) continue;
                const validation = await validateClientVariant({
                    file: { path: candidate.tempPath },
                    expectedFormat: encoder,
                    targetWidth: IMAGE_VARIANT_WIDTHS[variantKey],
                    maxPixels: MAX_INPUT_IMAGE_PIXELS
                });
                if (validation.ok) {
                    acceptedClientVariants[variantKey] = {
                        tempPath: candidate.tempPath,
                        width: validation.width,
                        height: validation.height
                    };
                    pendingClientVariantTempPaths.add(candidate.tempPath);
                } else {
                    await fsPromises.unlink(candidate.tempPath).catch(() => {});
                }
            }
        }

        const provenance = { large: 'server', medium: 'server', thumbnail: 'server' };
        const generatedByFormat = {};
        for (const format of deliveryFormats) {
            generatedByFormat[format.encoder] = {};
            const isPrimaryFormat = format.encoder === encoder;
            const variantWidths = posOnly
                ? { pos_thumbnail: IMAGE_VARIANT_WIDTHS.pos_thumbnail }
                : { thumbnail: 400, medium: 1024, large: 1920 };
            for (const [variantKey, width] of Object.entries(variantWidths)) {
                const variantFilename = `${IMAGE_VARIANT_FILE_NAMES[variantKey]}${format.ext}`;
                const variantRelativePath = path.posix.join(
                    normalizedSurface,
                    ...normalizedScopeSegments.map((segment) => toPosixRelative(segment)),
                    assetId,
                    variantFilename
                );
                const variantAbsolutePath = path.join(publicAssetDir, variantFilename);

                if (isPrimaryFormat && variantKey === 'large' && acceptedLargeUsed) {
                    await fsPromises.copyFile(originalAbsolutePath, variantAbsolutePath);
                    const copiedStat = await fsPromises.stat(variantAbsolutePath);
                    generatedByFormat[format.encoder].large = {
                        path: variantRelativePath,
                        url: buildPublicUrl(variantRelativePath),
                        width: acceptedLargeValidation.width,
                        height: acceptedLargeValidation.height,
                        size: Number.isFinite(copiedStat?.size) ? copiedStat.size : null,
                        mime: `image/${format.encoder}`
                    };
                    provenance.large = 'client';
                    continue;
                }

                if (isPrimaryFormat && acceptedClientVariants[variantKey]) {
                    const clientVariant = acceptedClientVariants[variantKey];
                    await fsPromises.copyFile(clientVariant.tempPath, variantAbsolutePath);
                    const copiedStat = await fsPromises.stat(variantAbsolutePath);
                    await fsPromises.unlink(clientVariant.tempPath).catch(() => {});
                    pendingClientVariantTempPaths.delete(clientVariant.tempPath);
                    generatedByFormat[format.encoder][variantKey] = {
                        path: variantRelativePath,
                        url: buildPublicUrl(variantRelativePath),
                        width: clientVariant.width,
                        height: clientVariant.height,
                        size: Number.isFinite(copiedStat?.size) ? copiedStat.size : null,
                        mime: `image/${format.encoder}`
                    };
                    provenance[variantKey] = 'client';
                    continue;
                }

                if (isPrimaryFormat && acceptedLargeUsed && variantKey !== 'large') {
                    // Deferred to the deriveVariantsFromAcceptedLarge batch below -- no
                    // client-supplied file for this key, but the accepted large lets us derive it
                    // more cheaply than re-encoding from the (possibly much larger) original.
                    continue;
                }

                const output = await buildVariantOutput({
                    sourcePath: originalAbsolutePath,
                    destinationPath: variantAbsolutePath,
                    encoder: format.encoder,
                    variantKey,
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

        if (acceptedLargeUsed) {
            const remainingKeys = ['medium', 'thumbnail'].filter((key) => !generatedByFormat[encoder]?.[key]);
            if (remainingKeys.length > 0) {
                const primaryFormat = deliveryFormats.find((format) => format.encoder === encoder);
                const derived = await deriveVariantsFromAcceptedLarge({
                    acceptedLargePath: originalAbsolutePath,
                    publicAssetDir,
                    normalizedSurface,
                    normalizedScopeSegments,
                    assetId,
                    deliveryFormats: [primaryFormat],
                    sourceWidth: acceptedLargeValidation.width ?? sourceWidth,
                    variantKeys: remainingKeys
                });
                for (const variantKey of remainingKeys) {
                    if (derived[encoder]?.[variantKey]) {
                        generatedByFormat[encoder][variantKey] = derived[encoder][variantKey];
                    }
                }
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

        const largeVariant = generatedVariants.large || generatedVariants.pos_thumbnail;
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
                size: Number.isFinite(originalStat?.size) ? originalStat.size : null,
                // Additive (Phase 301, #265): the pre-conversion MIME hint the client's manifest
                // claimed for this original, if any -- null for every upload that predates this
                // phase or simply omits a manifest, unchanged from today's shape otherwise.
                source_mime_hint: sourceMimeHint || null
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
            },
            // Additive (Phase 301, #265): per-variant provenance for the PRIMARY delivery format
            // only ('client' when this specific variant was accepted from the upload directly
            // rather than server-encoded) -- lets a future UI distinguish "client-optimized" from
            // "server-derived" without changing any existing field. Always all-'server' for a
            // request that never opts into the accepted-large/client-variant contract.
            provenance
        };
        const manifestPath = path.join(publicAssetDir, 'asset.json');
        await fsPromises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

        if (!retainOriginal) {
            await fsPromises.rm(originalAssetDir, { recursive: true, force: true });
        }

        const buildStoredFormatUrls = (formatVariants = {}) => ({
            ...(posOnly ? { pos_thumbnail_url: formatVariants.pos_thumbnail?.url || null } : {}),
            thumbnail_url: (formatVariants.thumbnail || formatVariants.pos_thumbnail)?.url || null,
            medium_url: (formatVariants.medium || formatVariants.pos_thumbnail)?.url || null,
            large_url: (formatVariants.large || formatVariants.pos_thumbnail)?.url || null
        });
        const imageVariants = {
            ...buildStoredFormatUrls(generatedVariants),
            placeholder_url: manifest.placeholder.url,
            webp: buildStoredFormatUrls(generatedByFormat.webp),
            widths: posOnly ? { pos_thumbnail: 144 } : { thumbnail: 400, medium: 1024, large: 1920 },
            version: RESPONSIVE_ASSET_VERSION
        };
        const cpuDelta = process.cpuUsage(cpuStart);
        logger.info('[ImageAssetStorage] storeOptimizedImageAsset completed', {
            asset_id: assetId,
            classification,
            source_bytes: manifest.original.size,
            source_w: sourceWidth,
            source_h: sourceHeight,
            encode_count: encodeCount,
            wall_ms: Date.now() - wallStart,
            cpu_ms: Math.round((cpuDelta.user + cpuDelta.system) / 1000),
            // Phase 298 (#265): lets the client-vs-server fallback rate be sliced by rollout
            // stage, not just aggregated -- see imageClientConversionGate.js.
            image_client_conversion_state: imageClientConversionState,
            image_client_conversion_scope: imageClientConversionScope
        });

        return {
            path: largeVariant.path,
            url: largeVariant.url,
            variants: generatedVariants,
            format_variants: generatedByFormat,
            placeholder: manifest.placeholder,
            image_variants: imageVariants,
            original: {
                path: manifest.original.path,
                url: null,
                width: manifest.original.width,
                height: manifest.original.height,
                size: manifest.original.size,
                mime: manifest.original.mime,
                source_mime_hint: manifest.original.source_mime_hint
            },
            classification,
            // Additive (Phase 301, #265): see the matching comment on `manifest.provenance` above.
            provenance,
            original_source: acceptedLargeUsed ? 'client_optimized' : 'server_derived'
        };
    } catch (error) {
        await fsPromises.rm(publicAssetDir, { recursive: true, force: true });
        await fsPromises.rm(originalAssetDir, { recursive: true, force: true });
        await Promise.all([...pendingClientVariantTempPaths].map((tempFilePath) => (
            fsPromises.unlink(tempFilePath).catch(() => {})
        )));
        throw error;
    }
};

const resolvePosThumbnailPaths = ({ uploadsRoot, storedPath }) => {
    const normalized = String(storedPath || '').replace(/\\/g, '/');
    if (!/^(pos-catalog|storefront-catalog)\//.test(normalized)) return null;
    const source = path.resolve(uploadsRoot, normalized);
    const root = path.resolve(uploadsRoot) + path.sep;
    if (!source.startsWith(root) || !RESPONSIVE_ASSET_FOLDER_PATTERN.test(path.basename(path.dirname(source)))) return null;
    const destination = path.join(path.dirname(source), 'pos-thumb.webp');
    return { source, destination, url: buildPublicUrl(path.posix.join(path.posix.dirname(normalized), 'pos-thumb.webp')) };
};

// POS delivery derivative only: no Storefront URL, manifest, or gallery mutation.
export const ensurePosImageThumbnail = async ({ uploadsRoot, storedPath }) => {
    const paths = resolvePosThumbnailPaths({ uploadsRoot, storedPath });
    if (!paths) return null;
    if (!await fileExists(paths.destination)) {
        const temporary = `${paths.destination}.${crypto.randomUUID()}.tmp`;
        try {
            await getSafeImageInput(paths.source).rotate().resize(144, 144, { fit: 'cover' })
                .webp({ quality: 78, effort: 2 }).toFile(temporary);
            await fsPromises.rename(temporary, paths.destination);
        } finally {
            await fsPromises.unlink(temporary).catch(() => {});
        }
    }
    return paths.url;
};

export const readPosImageVariantUrls = async ({ uploadsRoot, storedPath, storedUrl, variants }) => {
    const result = variants || deriveImageAssetVariantUrls({ storedPath, storedUrl });
    const paths = resolvePosThumbnailPaths({ uploadsRoot, storedPath });
    const exists = paths && await fileExists(paths.destination);
    return { ...result, pos_thumbnail_url: exists ? paths.url : null };
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
