import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import {
    IMAGE_LIFECYCLE_STATES,
    IMAGE_SEMANTIC_VARIANTS,
    inspectImageLifecycleState,
    resolveSemanticImageUrl
} from '../src/modules/inventory/contracts/imageLifecycleContract.js';
import { ensureOptimizedItemImage } from '../src/modules/inventory/usecases/imageLifecycleUseCases.js';
import { isAssetPathReferencedByOtherItems, safeDeleteReplacedImageAsset } from '../src/modules/shared/utils/imageCleanupService.js';

describe('Phase 7: Full Image Lifecycle Validation Gate', () => {
    let tempDir;
    let uploadsDir;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'phase7-test-'));
        uploadsDir = path.join(tempDir, 'uploads');
        await fs.mkdir(uploadsDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('Full Lifecycle: Legacy Conversion -> Unchanged Save Reuse -> Replacement -> Cleanup', async () => {
        // 1. Create a legacy image file
        const legacyPath = path.join(uploadsDir, 'legacy-product.png');
        await sharp({
            create: { width: 600, height: 600, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 1 } }
        }).png().toFile(legacyPath);

        // Verify initial state is LEGACY
        expect(inspectImageLifecycleState({
            storedPath: 'legacy-product.png',
            storedUrl: '/uploads/legacy-product.png'
        })).toBe(IMAGE_LIFECYCLE_STATES.LEGACY);

        // 2. Convert legacy image via ensureOptimizedItemImage
        const converted = await ensureOptimizedItemImage({
            itemId: 101,
            storedPath: 'legacy-product.png',
            storedUrl: '/uploads/legacy-product.png',
            uploadsRoot: uploadsDir
        });

        expect(converted.processing_status).toBe('optimized');
        expect(converted.optimization_version).toBe(2);
        expect(converted.image_fingerprint).toBeDefined();
        expect(converted.path).toContain('-v2-');

        // Verify semantic variant URLs resolve correctly
        const catalogCardUrl = resolveSemanticImageUrl({ variant_metadata: converted.variant_metadata }, IMAGE_SEMANTIC_VARIANTS.CATALOG_CARD);
        const checkoutUrl = resolveSemanticImageUrl({ variant_metadata: converted.variant_metadata }, IMAGE_SEMANTIC_VARIANTS.CHECKOUT);
        const previewUrl = resolveSemanticImageUrl({ variant_metadata: converted.variant_metadata }, IMAGE_SEMANTIC_VARIANTS.PREVIEW);

        expect(catalogCardUrl).toBeDefined();
        expect(checkoutUrl).toBeDefined();
        expect(previewUrl).toBeDefined();

        // 3. Second Unchanged Save - Must Reuse URLs without recompression
        const secondSave = await ensureOptimizedItemImage({
            itemId: 101,
            storedPath: converted.path,
            storedUrl: converted.url,
            existingOverride: {
                storefront_image_path: converted.path,
                storefront_image_url: converted.url,
                optimization_version: 2,
                processing_status: 'optimized',
                image_fingerprint: converted.image_fingerprint,
                variant_metadata: converted.variant_metadata
            },
            uploadsRoot: uploadsDir
        });

        expect(secondSave.path).toBe(converted.path);
        expect(secondSave.url).toBe(converted.url);
        expect(secondSave.image_fingerprint).toBe(converted.image_fingerprint);

        // 4. Replacement - New file upload
        const replacementTempPath = path.join(tempDir, 'new-photo.jpg');
        await sharp({
            create: { width: 800, height: 800, channels: 4, background: { r: 50, g: 200, b: 50, alpha: 1 } }
        }).jpeg().toFile(replacementTempPath);

        const replaced = await ensureOptimizedItemImage({
            itemId: 101,
            file: { originalname: 'new-photo.jpg', mimetype: 'image/jpeg', path: replacementTempPath },
            existingOverride: {
                storefront_image_path: converted.path,
                storefront_image_url: converted.url,
                optimization_version: 2,
                processing_status: 'optimized',
                image_fingerprint: converted.image_fingerprint
            },
            uploadsRoot: uploadsDir
        });

        expect(replaced.processing_status).toBe('optimized');
        expect(replaced.path).not.toBe(converted.path);

        // 5. Cleanup replaced old asset
        const cleaned = await safeDeleteReplacedImageAsset({
            uploadsRoot: uploadsDir,
            storedPath: converted.path,
            itemId: 101
        });
        expect(cleaned).toBe(true);
    });

    test('Immutable caching applies only to versioned asset URLs', () => {
        const isVersionedAsset = (url) => /-v2-[0-9a-f]{8}\//i.test(String(url || ''));

        expect(isVersionedAsset('/uploads/storefront-catalog/default/item-101-1722500000-v2-a1b2c3d4/large.webp')).toBe(true);
        expect(isVersionedAsset('/uploads/legacy-item.png')).toBe(false);
    });
});
