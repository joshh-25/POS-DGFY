import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import {
    deriveImageAssetVariantUrls,
    MAX_PUBLIC_IMAGE_BYTES,
    removeOptimizedImageAsset,
    storeOptimizedImageAsset
} from '../src/modules/shared/utils/imageAssetStorage.js';

describe('imageAssetStorage utility', () => {
    let uploadsRoot;

    beforeEach(async () => {
        uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-image-asset-'));
    });

    afterEach(async () => {
        if (uploadsRoot) {
            await fs.rm(uploadsRoot, { recursive: true, force: true });
        }
    });

    it('preserves originals and generates public delivery variants for photos', async () => {
        const tempPath = path.join(uploadsRoot, 'upload-photo.jpg');
        await sharp({
            create: {
                width: 2400,
                height: 1800,
                channels: 3,
                background: { r: 180, g: 120, b: 80 }
            }
        }).jpeg({ quality: 92 }).toFile(tempPath);

        const stored = await storeOptimizedImageAsset({
            uploadsRoot,
            surfaceFolder: 'storefront-catalog',
            scopeSegments: ['tenant-a'],
            assetBaseName: 'item-10',
            originalName: 'menu-photo.jpg',
            reportedMime: 'image/jpeg',
            tempPath
        });

        expect(stored.path).toMatch(/storefront-catalog\/tenant-a\/item-10-.*\/large\.webp$/);
        expect(stored.original.path).toMatch(/originals\/storefront-catalog\/tenant-a\/item-10-.*\/original\.jpg$/);
        expect(stored.image_variants.thumbnail_url).toMatch(/\/thumb\.webp$/);
        expect(stored.image_variants.medium_url).toMatch(/\/medium\.webp$/);
        expect(stored.image_variants.large_url).toMatch(/\/large\.webp$/);

        await expect(fs.access(path.join(uploadsRoot, stored.path))).resolves.toBeUndefined();
        await expect(fs.access(path.join(uploadsRoot, stored.original.path))).resolves.toBeUndefined();
        expect(stored.variants.large.size).toBeLessThanOrEqual(MAX_PUBLIC_IMAGE_BYTES);
    });

    it('avoids upscaling small graphics and keeps the primary delivery path stable', async () => {
        const tempPath = path.join(uploadsRoot, 'upload-graphic.png');
        await sharp({
            create: {
                width: 320,
                height: 180,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        }).png().toFile(tempPath);

        const stored = await storeOptimizedImageAsset({
            uploadsRoot,
            surfaceFolder: 'storefront-assets',
            scopeSegments: ['tenant-b'],
            assetBaseName: 'cover-test',
            originalName: 'cover.png',
            reportedMime: 'image/png',
            tempPath
        });

        const largeMeta = await sharp(path.join(uploadsRoot, stored.path)).metadata();
        expect(largeMeta.width).toBe(320);
        expect(stored.variants.thumbnail).toBeNull();
        expect(stored.variants.medium).toBeNull();
        expect(stored.path).toMatch(/storefront-assets\/tenant-b\/cover-test-.*\/large\.png$/);
    });

    it('derives sibling variant urls and removes the full asset footprint', async () => {
        const tempPath = path.join(uploadsRoot, 'upload-photo-2.jpg');
        await sharp({
            create: {
                width: 1800,
                height: 1200,
                channels: 3,
                background: { r: 40, g: 80, b: 160 }
            }
        }).jpeg({ quality: 90 }).toFile(tempPath);

        const stored = await storeOptimizedImageAsset({
            uploadsRoot,
            surfaceFolder: 'pos-catalog',
            scopeSegments: ['tenant-c'],
            assetBaseName: 'item-30',
            originalName: 'pos-photo.jpg',
            reportedMime: 'image/jpeg',
            tempPath
        });

        expect(deriveImageAssetVariantUrls({ storedPath: stored.path })).toEqual(stored.image_variants);

        const publicAssetDir = path.join(uploadsRoot, path.dirname(stored.path));
        const originalAssetDir = path.join(uploadsRoot, stored.original.path.split('/').slice(0, -1).join(path.sep));
        await removeOptimizedImageAsset({ uploadsRoot, storedPath: stored.path });

        await expect(fs.access(publicAssetDir)).rejects.toThrow();
        await expect(fs.access(originalAssetDir)).rejects.toThrow();
    });
});
