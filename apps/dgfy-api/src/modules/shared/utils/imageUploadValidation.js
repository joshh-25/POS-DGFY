import fs from 'fs/promises';
import sharp from 'sharp';

export const SAFE_IMAGE_MIME_TYPES = Object.freeze([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/avif'
]);

// Single source of truth for the sharp `limitInputPixels` cap used both when reading an upload's
// own metadata (imageAssetStorage.js) and when validating a client-supplied pre-optimized variant
// (validateClientVariant below) -- moved here from imageAssetStorage.js in Phase 299 (#265) since
// this is the more natural home for a validation constant, and imageAssetStorage.js now imports it
// from here instead of redeclaring it.
export const MAX_INPUT_IMAGE_PIXELS = 40 * 1024 * 1024;

const MAX_SIGNATURE_BYTES = 64;

const hasPrefix = (bytes, prefix = []) => (
    Array.isArray(prefix)
    && prefix.length > 0
    && prefix.every((value, index) => bytes[index] === value)
);

const bytesToAscii = (bytes, start, end) => Buffer.from(bytes.slice(start, end)).toString('ascii');

const detectImageMimeFromBuffer = (bytes = Buffer.alloc(0)) => {
    if (!bytes || bytes.length < 4) return null;

    if (hasPrefix(bytes, [0xFF, 0xD8, 0xFF])) return 'image/jpeg';
    if (hasPrefix(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'image/png';
    if (bytesToAscii(bytes, 0, 6) === 'GIF87a' || bytesToAscii(bytes, 0, 6) === 'GIF89a') return 'image/gif';
    if (bytesToAscii(bytes, 0, 4) === 'RIFF' && bytesToAscii(bytes, 8, 12) === 'WEBP') return 'image/webp';
    if (bytesToAscii(bytes, 0, 2) === 'BM') return 'image/bmp';

    const hasFtyp = bytesToAscii(bytes, 4, 8) === 'ftyp';
    if (hasFtyp) {
        const brand = bytesToAscii(bytes, 8, 12);
        if (brand === 'avif' || brand === 'avis') {
            return 'image/avif';
        }
    }

    return null;
};

const normalizeMime = (value) => String(value || '').trim().toLowerCase();

export const validateImageUploadFile = async ({
    file,
    allowedMimeTypes = SAFE_IMAGE_MIME_TYPES,
    maxBytes = null
} = {}) => {
    const normalizedAllowed = new Set((Array.isArray(allowedMimeTypes) ? allowedMimeTypes : SAFE_IMAGE_MIME_TYPES)
        .map((mime) => normalizeMime(mime))
        .filter(Boolean));

    if (!file?.path) {
        return { ok: false, reason: 'missing_file_path' };
    }

    const reportedMime = normalizeMime(file?.mimetype);
    if (!reportedMime || !normalizedAllowed.has(reportedMime)) {
        return { ok: false, reason: 'unsupported_reported_mime', reportedMime };
    }

    const size = Number(file?.size);
    if (Number.isFinite(maxBytes) && maxBytes > 0 && Number.isFinite(size) && size > maxBytes) {
        return { ok: false, reason: 'file_too_large', size, maxBytes };
    }

    let handle;
    try {
        handle = await fs.open(file.path, 'r');
        const sample = Buffer.alloc(MAX_SIGNATURE_BYTES);
        const { bytesRead } = await handle.read(sample, 0, MAX_SIGNATURE_BYTES, 0);
        const detectedMime = detectImageMimeFromBuffer(sample.subarray(0, bytesRead));

        if (!detectedMime || !normalizedAllowed.has(detectedMime)) {
            return { ok: false, reason: 'unsupported_file_signature', reportedMime, detectedMime };
        }
        if (detectedMime !== reportedMime) {
            return { ok: false, reason: 'mime_signature_mismatch', reportedMime, detectedMime };
        }

        return {
            ok: true,
            detectedMime,
            reportedMime,
            size: Number.isFinite(size) ? size : null
        };
    } catch (error) {
        return { ok: false, reason: 'signature_read_failed', error: error?.message || 'unknown_error' };
    } finally {
        if (handle) {
            try {
                await handle.close();
            } catch {
                // no-op
            }
        }
    }
};

/**
 * Validates a client-supplied, already-optimized image variant (a pre-resized `image_medium` /
 * `image_thumbnail` file, or the primary `image` field itself when the caller flags it as an
 * already-optimized "large") before the server trusts it enough to skip re-encoding.
 *
 * Header-only: reads the file's actual decoded format/dimensions via `sharp(...).metadata()`
 * rather than trusting the multipart-reported MIME type -- this is a stronger check than
 * validateImageUploadFile's magic-byte sniff (it decodes the real container), so no separate
 * signature-sniff pass is layered on top of it.
 *
 * Never throws past the caller and never fails the request -- a rejected variant here means the
 * caller falls back to deriving that variant server-side, exactly as if the client had never sent
 * it (Phase 299, #265: "the upload never hard-fails on client encode failure").
 *
 * @param {object} params
 * @param {{path: string}} params.file - the candidate variant file (only `path` is read).
 * @param {string} [params.expectedFormat] - sharp's own format string ('webp'|'png'|'jpeg'|...)
 *   the variant must match. Compared against classifyImageAsset's chosen public delivery format,
 *   never the client's own reported MIME.
 * @param {number} [params.targetWidth] - the variant's expected width (IMAGE_VARIANT_WIDTHS[key]).
 *   Allows up to 2px of slack for rounding; anything wider is rejected (never upscaled, never
 *   silently accepted oversized).
 * @param {number} [params.maxPixels] - width * height must not exceed this (same cap
 *   storeOptimizedImageAsset applies to every image it reads).
 * @returns {Promise<{ok: boolean, reason?: string, format?: string, width?: number|null,
 *   height?: number|null}>}
 */
export const validateClientVariant = async ({
    file,
    expectedFormat = null,
    targetWidth = null,
    maxPixels = null
} = {}) => {
    const filePath = file?.path;
    if (!filePath) {
        return { ok: false, reason: 'missing_file_path' };
    }

    let metadata;
    try {
        metadata = await sharp(filePath, { limitInputPixels: MAX_INPUT_IMAGE_PIXELS, failOn: 'error' }).metadata();
    } catch (error) {
        return { ok: false, reason: 'metadata_read_failed', error: error?.message || 'unknown_error' };
    }

    const detectedFormat = String(metadata?.format || '').trim().toLowerCase();
    const normalizedExpected = String(expectedFormat || '').trim().toLowerCase();
    if (normalizedExpected && detectedFormat !== normalizedExpected) {
        return { ok: false, reason: 'format_mismatch', expectedFormat: normalizedExpected, detectedFormat };
    }

    const width = Number.isFinite(metadata?.width) ? metadata.width : null;
    const height = Number.isFinite(metadata?.height) ? metadata.height : null;
    if (Number.isFinite(targetWidth) && targetWidth > 0) {
        if (!Number.isFinite(width) || width > targetWidth + 2) {
            return { ok: false, reason: 'width_exceeds_target', width, targetWidth };
        }
    }

    const pixels = Number.isFinite(width) && Number.isFinite(height) ? width * height : null;
    if (Number.isFinite(maxPixels) && maxPixels > 0 && Number.isFinite(pixels) && pixels > maxPixels) {
        return { ok: false, reason: 'pixel_cap_exceeded', pixels, maxPixels };
    }

    return { ok: true, format: detectedFormat, width, height };
};

/**
 * Parses the optional `client_image_manifest` multipart text field into a hint bag. Untrusted
 * input, never a trust boundary -- any parse failure or unrecognized shape returns `null` rather
 * than throwing, so a malformed manifest never crashes or fails the request; the caller simply
 * proceeds as if no manifest had been sent at all.
 *
 * Recognized shape: `{ "source_mime_hint"?: string, "large_pre_optimized"?: boolean }`. Nothing
 * else in the manifest is read today -- see this module's own callers (posUseCases.js,
 * storefrontCatalogUseCases.js) for how each field is used.
 *
 * @param {unknown} raw - the raw `client_image_manifest` field value (a JSON string, or absent).
 * @returns {{sourceMimeHint: string|null, largePreOptimized: boolean}|null}
 */
export const parseClientImageManifest = (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) return null;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const sourceMimeHint = typeof parsed.source_mime_hint === 'string'
        ? parsed.source_mime_hint.trim().toLowerCase()
        : null;

    return {
        sourceMimeHint: sourceMimeHint || null,
        largePreOptimized: parsed.large_pre_optimized === true
    };
};

