import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export const IMAGE_VARIANT_WIDTHS = Object.freeze({
    thumbnail: 400,
    medium: 1024,
    large: 1920
});

export const MAX_PUBLIC_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_IMAGE_PIXELS = 40 * 1024 * 1024;
const PHOTO_QUALITY_STEPS = Object.freeze([80, 76, 72, 68]);
const GRAPHIC_QUALITY_STEPS = Object.freeze([100, 90, 80]);

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

const classifyImageAsset = ({ reportedMime }) => {
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
    const qualitySteps = encoder === 'webp' ? PHOTO_QUALITY_STEPS : GRAPHIC_QUALITY_STEPS;

    for (const candidateWidth of candidateWidths) {
        for (const quality of qualitySteps) {
            const transform = getSafeImageInput(sourcePath).rotate();
            if (Number.isFinite(candidateWidth) && candidateWidth > 0) {
                transform.resize({ width: candidateWidth, fit: 'inside', withoutEnlargement: true });
            } else {
                transform.resize({ fit: 'inside', withoutEnlargement: true });
            }

            if (encoder === 'webp') {
                transform.webp({ quality, effort: 5 });
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
                return output;
            }
        }
    }

    throw new Error(`Unable to optimize image below ${maxBytes} bytes`);
};

const buildPublicUrl = (relativePath) => `/uploads/${toPosixRelative(relativePath)}`;

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
    const buildUrlForVariant = (variantKey) => buildPublicUrl(path.posix.join(
        parentDir,
        `${IMAGE_VARIANT_FILE_NAMES[variantKey]}${extension}`
    ));

    return {
        thumbnail_url: buildUrlForVariant('thumbnail'),
        medium_url: buildUrlForVariant('medium'),
        large_url: buildUrlForVariant('large')
    };
};

export const storeOptimizedImageAsset = async ({
    uploadsRoot,
    surfaceFolder,
    scopeSegments = [],
    assetBaseName = 'asset',
    originalName,
    reportedMime,
    tempPath
}) => {
    if (!uploadsRoot || !surfaceFolder || !tempPath) {
        throw new Error('uploadsRoot, surfaceFolder, and tempPath are required');
    }

    const normalizedSurface = sanitizeSegment(surfaceFolder, 'assets');
    const normalizedScopeSegments = (Array.isArray(scopeSegments) ? scopeSegments : [])
        .map((segment) => sanitizeSegment(segment, 'default'))
        .filter(Boolean);
    const assetId = `${sanitizeSegment(assetBaseName)}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const publicAssetDir = path.join(uploadsRoot, normalizedSurface, ...normalizedScopeSegments, assetId);
    const originalAssetDir = path.join(uploadsRoot, 'originals', normalizedSurface, ...normalizedScopeSegments, assetId);
    await fsPromises.mkdir(publicAssetDir, { recursive: true });
    await fsPromises.mkdir(originalAssetDir, { recursive: true });

    try {
        const classification = classifyImageAsset({ reportedMime });
        const { ext: publicExt, encoder } = getPublicFormat({ classification });
        const originalExt = getOriginalExtension({ originalName, reportedMime });
        const originalFilename = `original${originalExt}`;
        const originalAbsolutePath = path.join(originalAssetDir, originalFilename);
        await fsPromises.rename(tempPath, originalAbsolutePath);

        const originalMeta = await getSafeImageInput(originalAbsolutePath).metadata();
        const originalStat = await fsPromises.stat(originalAbsolutePath);
        const sourceWidth = Number.isFinite(originalMeta?.width) ? originalMeta.width : null;
        const sourceHeight = Number.isFinite(originalMeta?.height) ? originalMeta.height : null;

        const generatedVariants = {};
        for (const [variantKey, width] of Object.entries(IMAGE_VARIANT_WIDTHS)) {
            if (variantKey !== 'large' && Number.isFinite(sourceWidth) && sourceWidth < width) {
                generatedVariants[variantKey] = null;
                continue;
            }

            const variantFilename = `${IMAGE_VARIANT_FILE_NAMES[variantKey]}${publicExt}`;
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
                encoder,
                width,
                sourceWidth,
                maxBytes: variantKey === 'large' ? MAX_PUBLIC_IMAGE_BYTES : null
            });
            generatedVariants[variantKey] = {
                path: variantRelativePath,
                url: buildPublicUrl(variantRelativePath),
                width: output.width,
                height: output.height,
                size: output.size,
                mime: encoder === 'webp' ? 'image/webp' : 'image/png'
            };
        }

        const largeVariant = generatedVariants.large;
        if (!largeVariant?.path || !largeVariant?.url) {
            throw new Error('Large image variant was not generated');
        }

        const manifest = {
        asset_id: assetId,
        surface: normalizedSurface,
        scope_segments: normalizedScopeSegments,
        classification,
        original: {
            path: toPosixRelative(path.relative(uploadsRoot, originalAbsolutePath)),
            filename: originalFilename,
            mime: String(reportedMime || '').trim().toLowerCase() || null,
            width: sourceWidth,
            height: sourceHeight,
            size: Number.isFinite(originalStat?.size) ? originalStat.size : null
        },
        variants: generatedVariants
        };
        const manifestPath = path.join(publicAssetDir, 'asset.json');
        await fsPromises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

        return {
        path: largeVariant.path,
        url: largeVariant.url,
        variants: {
            thumbnail: generatedVariants.thumbnail,
            medium: generatedVariants.medium,
            large: generatedVariants.large
        },
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
    const assetFolderExists = await fileExists(assetFolderAbsolute);
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
    if (assetFolderParts.length >= 2) {
        const originalFolderAbsolute = path.join(uploadsRoot, 'originals', ...assetFolderParts);
        if (await fileExists(originalFolderAbsolute)) {
            await fsPromises.rm(originalFolderAbsolute, { recursive: true, force: true });
        }
    }
};
