import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { ensureOptimizedItemImage } from '../src/modules/inventory/usecases/imageLifecycleUseCases.js';

describe('imageLifecycleUseCases (ensureOptimizedItemImage)', () => {
    let tempDir;
    let uploadsDir;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'img-test-'));
        uploadsDir = path.join(tempDir, 'uploads');
        await fs.mkdir(uploadsDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('returns null fields for missing image', async () => {
        const result = await ensureOptimizedItemImage({ itemId: 1 });
        expect(result.path).toBeNull();
        expect(result.url).toBeNull();
        expect(result.processing_status).toBeNull();
    });

    test('returns external status for external image URLs', async () => {
        const result = await ensureOptimizedItemImage({
            itemId: 1,
            storedUrl: 'https://cdn.example.com/item.png'
        });
        expect(result.url).toBe('https://cdn.example.com/item.png');
        expect(result.processing_status).toBe('external');
    });

    test('optimizes a legacy local image file into responsive v2 asset layout', async () => {
        // Create sample local image file in uploadsDir
        const sampleImgPath = path.join(uploadsDir, 'legacy-item.png');
        await sharp({
            create: {
                width: 500,
                height: 500,
                channels: 4,
                background: { r: 255, g: 0, b: 0, alpha: 1 }
            }
        }).png().toFile(sampleImgPath);

        const result = await ensureOptimizedItemImage({
            itemId: 42,
            storedPath: 'legacy-item.png',
            storedUrl: '/uploads/legacy-item.png',
            uploadsRoot: uploadsDir
        });

        expect(result.processing_status).toBe('optimized');
        expect(result.optimization_version).toBe(2);
        expect(result.image_fingerprint).toBeDefined();
        expect(result.variant_metadata).toBeDefined();
        expect(result.variant_metadata.thumbnail).toBeDefined();
        expect(result.variant_metadata.catalog_card).toBeDefined();
    });

    test('reuses unchanged optimized image asset without recompression', async () => {
        const sampleImgPath = path.join(uploadsDir, 'optimized-item.png');
        await sharp({
            create: {
                width: 400,
                height: 400,
                channels: 4,
                background: { r: 0, g: 255, b: 0, alpha: 1 }
            }
        }).png().toFile(sampleImgPath);

        const existingOverride = {
            storefront_image_path: 'optimized-item.png',
            storefront_image_url: '/uploads/optimized-item.png',
            optimization_version: 2,
            processing_status: 'optimized',
            image_fingerprint: 'existing-hash-123',
            variant_metadata: {
                catalog_card: { url: '/uploads/optimized-item.png' }
            }
        };

        const result = await ensureOptimizedItemImage({
            itemId: 42,
            storedPath: 'optimized-item.png',
            storedUrl: '/uploads/optimized-item.png',
            existingOverride,
            uploadsRoot: uploadsDir
        });

        expect(result.processing_status).toBe('optimized');
        expect(result.optimization_version).toBe(2);
        expect(result.url).toBe('/uploads/optimized-item.png');
    });

    test('recognizes a freshly stored responsive-v2 asset from its manifest', async () => {
        const assetDirectory = path.join(uploadsDir, 'storefront-catalog', 'tenant', 'item-42-v2-test');
        const storedPath = 'storefront-catalog/tenant/item-42-v2-test/large.png';
        const storedUrl = `/uploads/${storedPath}`;
        const largePath = path.join(assetDirectory, 'large.png');
        await fs.mkdir(assetDirectory, { recursive: true });
        await fs.writeFile(largePath, Buffer.from('already-optimized-image'));
        await fs.writeFile(path.join(assetDirectory, 'asset.json'), JSON.stringify({
            version: 2,
            variants: {
                thumbnail: { path: 'storefront-catalog/tenant/item-42-v2-test/thumb.png', url: '/uploads/storefront-catalog/tenant/item-42-v2-test/thumb.png' },
                medium: { path: 'storefront-catalog/tenant/item-42-v2-test/medium.png', url: '/uploads/storefront-catalog/tenant/item-42-v2-test/medium.png' },
                large: { path: storedPath, url: storedUrl }
            },
            formats: {},
            placeholder: null
        }));

        const result = await ensureOptimizedItemImage({
            itemId: 42,
            storedPath,
            storedUrl,
            uploadsRoot: uploadsDir
        });

        expect(result).toEqual(expect.objectContaining({
            path: storedPath,
            url: storedUrl,
            optimization_version: 2,
            processing_status: 'optimized'
        }));
        expect(result.variant_metadata.thumbnail).toEqual(expect.objectContaining({
            url: '/uploads/storefront-catalog/tenant/item-42-v2-test/thumb.png'
        }));
        expect(result.image_fingerprint).toMatch(/^[a-f0-9]{64}$/);
        const generatedDirectories = (await fs.readdir(path.join(uploadsDir, 'storefront-catalog', 'tenant')))
            .filter((entry) => entry !== 'item-42-v2-test');
        expect(generatedDirectories).toEqual([]);
    });
});
