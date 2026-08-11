import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { resolveReceiptLogoRaster } from '../src/modules/pos/utils/receiptLogoRaster.js';

// Covers the LAN/USB ESC/POS bridge's logo path (see issue #321): the API
// pre-rasterizes a tenant's configured storefront profile image into a `GS v 0`
// ESC/POS payload for usbPrinter.js to print, since the on-prem bridge has no
// image library of its own.

let tempRoot;

beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'receipt-logo-raster-'));
});

afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
});

const settingsWithPath = (relativePath) => ({
    storefront_profile_image_path: { value: relativePath }
});

const writeSolidPng = async (relativePath, { width = 4, height = 4, color } = {}) => {
    const absolutePath = path.join(tempRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await sharp({
        create: { width, height, channels: 3, background: color }
    }).png().toFile(absolutePath);
    return absolutePath;
};

// GS v 0 header: 1D 76 30 00, then width-in-bytes (LE u16), height (LE u16).
const parseRasterHeader = (base64Payload) => {
    const buffer = Buffer.from(base64Payload, 'base64');
    return {
        marker: [buffer[0], buffer[1], buffer[2], buffer[3]],
        widthBytes: buffer[4] | (buffer[5] << 8),
        height: buffer[6] | (buffer[7] << 8),
        imageBytes: buffer.subarray(8)
    };
};

describe('resolveReceiptLogoRaster', () => {
    it('returns null when no storefront profile image path is configured', async () => {
        const result = await resolveReceiptLogoRaster({ settings: {}, uploadsRoot: tempRoot });
        expect(result).toBeNull();
    });

    it('returns null when the configured file does not exist on disk', async () => {
        const result = await resolveReceiptLogoRaster({
            settings: settingsWithPath('storefront-assets/t1/missing.png'),
            uploadsRoot: tempRoot
        });
        expect(result).toBeNull();
    });

    it('refuses a path that resolves outside uploadsRoot', async () => {
        const result = await resolveReceiptLogoRaster({
            settings: settingsWithPath('../outside.png'),
            uploadsRoot: tempRoot
        });
        expect(result).toBeNull();
    });

    it('produces a well-formed GS v 0 raster header and payload length', async () => {
        await writeSolidPng('storefront-assets/t1/profile.png', {
            width: 4,
            height: 4,
            color: { r: 0, g: 0, b: 0 }
        });

        const payload = await resolveReceiptLogoRaster({
            settings: settingsWithPath('storefront-assets/t1/profile.png'),
            uploadsRoot: tempRoot
        });

        expect(payload).toEqual(expect.any(String));
        const { marker, widthBytes, height, imageBytes } = parseRasterHeader(payload);

        // 4x4 source scaled to the fixed 256-dot raster width keeps a 1:1 aspect
        // ratio, so height also comes out at 256 (see RASTER_WIDTH_DOTS).
        expect(marker).toEqual([0x1D, 0x76, 0x30, 0x00]);
        expect(widthBytes).toBe(32); // 256 dots / 8
        expect(height).toBe(256);
        expect(imageBytes.length).toBe(widthBytes * height);
    });

    it('packs a solid black image as all print (1) bits', async () => {
        await writeSolidPng('storefront-assets/t1/black.png', {
            color: { r: 0, g: 0, b: 0 }
        });

        const payload = await resolveReceiptLogoRaster({
            settings: settingsWithPath('storefront-assets/t1/black.png'),
            uploadsRoot: tempRoot
        });
        const { imageBytes } = parseRasterHeader(payload);

        expect(imageBytes.every((byte) => byte === 0xFF)).toBe(true);
    });

    it('packs a solid white image as all blank (0) bits', async () => {
        await writeSolidPng('storefront-assets/t1/white.png', {
            color: { r: 255, g: 255, b: 255 }
        });

        const payload = await resolveReceiptLogoRaster({
            settings: settingsWithPath('storefront-assets/t1/white.png'),
            uploadsRoot: tempRoot
        });
        const { imageBytes } = parseRasterHeader(payload);

        expect(imageBytes.every((byte) => byte === 0x00)).toBe(true);
    });

    it('memoizes by (path, mtime): an unchanged mtime serves the cached payload even if the file content changes underneath it', async () => {
        const relativePath = 'storefront-assets/t1/cache-test.png';
        const absolutePath = await writeSolidPng(relativePath, { color: { r: 0, g: 0, b: 0 } });
        const settings = settingsWithPath(relativePath);

        // Pin mtime to a literal fixed value rather than reading back whatever the
        // filesystem assigned on write -- some filesystems quantize mtime
        // precision, and re-applying the identical Date both times (vs. reading it
        // back once and reapplying) keeps that quantization consistent across both
        // fs.utimes calls below, so the two resolve() calls land on the same key.
        const pinnedMtime = new Date('2026-01-01T00:00:00.000Z');
        await fs.utimes(absolutePath, pinnedMtime, pinnedMtime);

        const firstPayload = await resolveReceiptLogoRaster({ settings, uploadsRoot: tempRoot });

        // Swap the content but pin mtime back to the same literal value --
        // simulates two resolve() calls landing on the same cache key.
        await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 255, b: 255 } } })
            .png()
            .toFile(absolutePath);
        await fs.utimes(absolutePath, pinnedMtime, pinnedMtime);

        const secondPayload = await resolveReceiptLogoRaster({ settings, uploadsRoot: tempRoot });
        expect(secondPayload).toBe(firstPayload);

        // Now let mtime actually advance -- the cache key changes and the new
        // (white) content gets encoded fresh.
        const advancedMtime = new Date(pinnedMtime.getTime() + 5000);
        await fs.utimes(absolutePath, advancedMtime, advancedMtime);

        const thirdPayload = await resolveReceiptLogoRaster({ settings, uploadsRoot: tempRoot });
        expect(thirdPayload).not.toBe(firstPayload);
        const { imageBytes } = parseRasterHeader(thirdPayload);
        expect(imageBytes.every((byte) => byte === 0x00)).toBe(true);
    });
});
