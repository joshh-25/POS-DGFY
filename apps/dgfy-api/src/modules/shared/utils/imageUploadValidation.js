import fs from 'fs/promises';

export const SAFE_IMAGE_MIME_TYPES = Object.freeze([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/avif'
]);

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

