import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

// Encodes the tenant's configured storefront profile image (see
// storefront_profile_image_path in settingsValidator.js) into an ESC/POS raster
// image (`GS v 0`) so the LAN/USB bridge (device-bridge/printers/usbPrinter.js) can
// print the company icon on the receipt header, same as the Bluetooth/iMin path's
// ReceiptLogoProvider.kt -- see issue #321. Without this, the LAN/USB bridge prints
// no logo at all: it never had a hardcoded DGFY fallback to begin with, unlike the
// Android Bluetooth path.
//
// Runs on the API rather than the on-prem bridge because sharp is already an API
// dependency (see imageAssetStorage.js) and the API can read the uploaded file
// straight off disk -- shipping sharp to every bridge box just for this would be a
// new native dependency on hardware this repo doesn't control.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Same 4-levels-up-from-src pattern as storefrontAssetStorage.js's UPLOADS_ROOT
// (modules/pos/utils -> modules/pos -> modules -> src -> apps/dgfy-api/uploads).
const DEFAULT_UPLOADS_ROOT = path.resolve(__dirname, '../../../../uploads');

// Matches RECEIPT_LOGO_WIDTH_DOTS in imin-wrapper's ReceiptLogoProvider.kt -- the
// same visual size across every print transport, not a hardware-specific value.
const RASTER_WIDTH_DOTS = 256;
const DARK_LUMINANCE_THRESHOLD = 190;

// Bounded, unbounded-growth-safe memoization keyed by "<absolute path>:<mtimeMs>" --
// a re-uploaded icon at the same settings path gets a new mtime and so a fresh
// cache key, while repeat prints of an unchanged icon skip re-encoding. FIFO
// eviction (Map preserves insertion order) rather than a real LRU: this cache is
// small and print-triggered, not hot enough to justify more than "don't grow
// forever across a long-lived API process."
const MAX_CACHE_ENTRIES = 100;
const rasterCache = new Map();

const rememberRaster = (key, value) => {
    if (rasterCache.has(key)) rasterCache.delete(key);
    rasterCache.set(key, value);
    if (rasterCache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = rasterCache.keys().next().value;
        rasterCache.delete(oldestKey);
    }
};

const buildRasterPayload = (grayscaleBuffer, width, height) => {
    const widthBytes = Math.ceil(width / 8);
    const imageBytes = Buffer.alloc(widthBytes * height);

    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * width;
        for (let xByte = 0; xByte < widthBytes; xByte += 1) {
            let packed = 0;
            for (let bit = 0; bit < 8; bit += 1) {
                const x = xByte * 8 + bit;
                // threshold() maps dark pixels to 0 and light pixels to 255 -- pack
                // a 1 bit (print) for dark, matching bitmapToEscPosRaster in
                // ReceiptLogoProvider.kt.
                if (x < width && grayscaleBuffer[rowOffset + x] < 128) {
                    packed |= (0x80 >> bit);
                }
            }
            imageBytes[y * widthBytes + xByte] = packed;
        }
    }

    const header = Buffer.from([
        0x1D, 0x76, 0x30, 0x00,
        widthBytes & 0xFF, (widthBytes >> 8) & 0xFF,
        height & 0xFF, (height >> 8) & 0xFF
    ]);

    return Buffer.concat([header, imageBytes]);
};

// Returns a base64-encoded GS v 0 ESC/POS raster payload for the tenant's
// configured storefront profile image, or null when no icon is configured, the
// file is missing, or it fails to decode -- the caller (usbPrinter.js) simply
// omits the logo in that case rather than falling back to a platform image, since
// this LAN/USB path has no bundled DGFY drawable to fall back to.
export const resolveReceiptLogoRaster = async ({ settings = {}, uploadsRoot = DEFAULT_UPLOADS_ROOT } = {}) => {
    const relativePath = String(settings?.storefront_profile_image_path?.value || '').trim();
    if (!relativePath) return null;

    const absolutePath = path.resolve(uploadsRoot, relativePath);
    const uploadsRootWithSeparator = `${uploadsRoot}${path.sep}`;
    if (absolutePath !== uploadsRoot && !absolutePath.startsWith(uploadsRootWithSeparator)) {
        // Path traversal guard, same convention as removeOptimizedImageAsset in
        // imageAssetStorage.js -- a setting value should never escape uploadsRoot,
        // but this is a bare join so it's worth confirming rather than assuming.
        return null;
    }

    let stat;
    try {
        stat = await fs.stat(absolutePath);
    } catch {
        return null;
    }

    const cacheKey = `${absolutePath}:${stat.mtimeMs}`;
    const cached = rasterCache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
        const { data, info } = await sharp(absolutePath)
            // Transparent regions become white before thresholding -- the closest
            // analog to isDarkPixel's alpha<64 => "light" rule in
            // ReceiptLogoProvider.kt (both treat transparent as non-printing).
            .flatten({ background: '#ffffff' })
            .resize({ width: RASTER_WIDTH_DOTS })
            .greyscale()
            .threshold(DARK_LUMINANCE_THRESHOLD)
            .raw()
            .toBuffer({ resolveWithObject: true });

        const payload = buildRasterPayload(data, info.width, info.height).toString('base64');
        rememberRaster(cacheKey, payload);
        return payload;
    } catch {
        rememberRaster(cacheKey, null);
        return null;
    }
};

export default resolveReceiptLogoRaster;
