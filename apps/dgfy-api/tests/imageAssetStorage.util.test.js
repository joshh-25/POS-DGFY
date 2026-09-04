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
        expect(stored.image_variants.version).toBe(2);
        expect(stored.image_variants.placeholder_url).toMatch(/\/placeholder\.webp$/);
        expect(stored.image_variants.avif.thumbnail_url).toMatch(/\/thumb\.avif$/);
        expect(stored.image_variants.webp.large_url).toMatch(/\/large\.webp$/);

        await expect(fs.access(path.join(uploadsRoot, stored.path))).resolves.toBeUndefined();
        await expect(fs.access(path.join(uploadsRoot, stored.original.path))).resolves.toBeUndefined();
        await expect(fs.access(path.join(
            uploadsRoot,
            stored.image_variants.avif.thumbnail_url.replace(/^\/uploads\//, '')
        ))).resolves.toBeUndefined();
        await expect(fs.access(path.join(
            uploadsRoot,
            stored.image_variants.placeholder_url.replace(/^\/uploads\//, '')
        ))).resolves.toBeUndefined();
        expect(stored.variants.large.size).toBeLessThanOrEqual(MAX_PUBLIC_IMAGE_BYTES);
    });

    it('discards the temporary original after optimized variants are committed when requested', async () => {
        const tempPath = path.join(uploadsRoot, 'upload-photo-discard.jpg');
        await sharp({
            create: {
                width: 1200,
                height: 900,
                channels: 3,
                background: { r: 80, g: 140, b: 200 }
            }
        }).jpeg({ quality: 92 }).toFile(tempPath);

        const stored = await storeOptimizedImageAsset({
            uploadsRoot,
            surfaceFolder: 'storefront-catalog',
            scopeSegments: ['tenant-discard'],
            assetBaseName: 'item-11',
            originalName: 'menu-photo.jpg',
            reportedMime: 'image/jpeg',
            tempPath,
            retainOriginal: false
        });

        expect(stored.original.path).toBeNull();
        await expect(fs.access(path.join(uploadsRoot, stored.path))).resolves.toBeUndefined();
        await expect(fs.access(path.join(
            uploadsRoot,
            'originals',
            path.dirname(stored.path),
            'original.jpg'
        )))
            .rejects.toThrow();
    });

    it('creates every delivery variant for small graphics without upscaling', async () => {
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

        const variantMetadata = await Promise.all(
            Object.values(stored.variants).map((variant) => (
                sharp(path.join(uploadsRoot, variant.path)).metadata()
            ))
        );
        expect(variantMetadata.map((metadata) => metadata.width)).toEqual([320, 320, 320]);
        expect(stored.variants.thumbnail.url).toMatch(/\/thumb\.png$/);
        expect(stored.variants.medium.url).toMatch(/\/medium\.png$/);
        expect(stored.variants.large.url).toMatch(/\/large\.png$/);
        expect(stored.path).toMatch(/storefront-assets\/tenant-b\/cover-test-.*\/large\.png$/);
        expect(stored.image_variants.webp.thumbnail_url).toMatch(/\/thumb\.webp$/);
        expect(stored.image_variants.avif.thumbnail_url).toMatch(/\/thumb\.avif$/);
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

    it('#1379/#871: deleting a legacy flat-path image only removes that file, never the tenant directory', async () => {
        const tenantDir = path.join(uploadsRoot, 'storefront-catalog', 'tenant-legacy');
        await fs.mkdir(tenantDir, { recursive: true });

        const targetFile = 'item-41-1783000000000.jpg';
        const siblingFile = 'item-83-1783000000111.jpg';
        await fs.writeFile(path.join(tenantDir, targetFile), 'target-image-bytes');
        await fs.writeFile(path.join(tenantDir, siblingFile), 'sibling-image-bytes');

        const legacyOriginalDir = path.join(uploadsRoot, 'originals', 'storefront-catalog', 'tenant-legacy');
        await fs.mkdir(legacyOriginalDir, { recursive: true });
        await fs.writeFile(path.join(legacyOriginalDir, siblingFile), 'sibling-original-bytes');

        const storedPath = `storefront-catalog/tenant-legacy/${targetFile}`;
        await removeOptimizedImageAsset({ uploadsRoot, storedPath });

        // The deleted file is gone...
        await expect(fs.access(path.join(tenantDir, targetFile))).rejects.toThrow();
        // ...but every sibling in the tenant directory, and the tenant's
        // originals mirror, survive -- this is the #1379/#871 regression:
        // before the fix, the recursive rm targeted `tenantDir` itself and
        // wiped both.
        await expect(fs.access(path.join(tenantDir, siblingFile))).resolves.toBeUndefined();
        await expect(fs.access(path.join(legacyOriginalDir, siblingFile))).resolves.toBeUndefined();
    });

    it('still recurses and removes the full asset footprint for a v2 optimized-asset path (no regression)', async () => {
        const tempPath = path.join(uploadsRoot, 'upload-photo-v2-guard.jpg');
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
            surfaceFolder: 'storefront-catalog',
            scopeSegments: ['tenant-v2-guard'],
            assetBaseName: 'item-99',
            originalName: 'v2-guard.jpg',
            reportedMime: 'image/jpeg',
            tempPath
        });

        const publicAssetDir = path.join(uploadsRoot, path.dirname(stored.path));
        const originalAssetDir = path.join(uploadsRoot, stored.original.path.split('/').slice(0, -1).join(path.sep));
        const tenantDir = path.dirname(publicAssetDir);

        await removeOptimizedImageAsset({ uploadsRoot, storedPath: stored.path });

        await expect(fs.access(publicAssetDir)).rejects.toThrow();
        await expect(fs.access(originalAssetDir)).rejects.toThrow();
        // The v2 asset's own folder is gone, but the parent tenant directory
        // itself is untouched.
        await expect(fs.access(tenantDir)).resolves.toBeUndefined();
    });
});
