import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import {
    classifyImageAsset,
    deriveImageAssetVariantUrls,
    deriveVariantsFromAcceptedLarge,
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
        expect(stored.image_variants.version).toBe(3);
        expect(stored.image_variants.placeholder_url).toMatch(/\/placeholder\.webp$/);
        expect(stored.image_variants.avif).toBeUndefined();
        expect(stored.image_variants.webp.large_url).toMatch(/\/large\.webp$/);

        await expect(fs.access(path.join(uploadsRoot, stored.path))).resolves.toBeUndefined();
        await expect(fs.access(path.join(uploadsRoot, stored.original.path))).resolves.toBeUndefined();
        await expect(fs.access(path.join(
            uploadsRoot,
            stored.image_variants.placeholder_url.replace(/^\/uploads\//, '')
        ))).resolves.toBeUndefined();
        const publicAssetDirEntries = await fs.readdir(path.join(uploadsRoot, path.dirname(stored.path)));
        expect(publicAssetDirEntries.some((entry) => entry.endsWith('.avif'))).toBe(false);
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
        expect(stored.image_variants.avif).toBeUndefined();
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

    it('still recurses and removes the full asset footprint for a versioned optimized-asset path (no regression)', async () => {
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

    describe('deriveImageAssetVariantUrls -- version-gated avif', () => {
        it('v2 asset variants still include avif', () => {
            const storedPath = 'storefront-catalog/tenant-x/item-1-1700000000000-v2-a1b2c3d4/large.webp';
            const variants = deriveImageAssetVariantUrls({ storedPath });

            expect(variants.avif).toBeDefined();
            expect(variants.avif.thumbnail_url).toMatch(/thumb\.avif$/);
            expect(variants.version).toBe(2);
        });

        it('v3 asset variants omit avif', () => {
            const storedPath = 'storefront-catalog/tenant-x/item-1-1700000000000-v3-a1b2c3d4/large.webp';
            const variants = deriveImageAssetVariantUrls({ storedPath });

            expect(variants.avif).toBeUndefined();
            expect(variants.webp).toBeDefined();
            expect(variants.version).toBe(3);
        });
    });

    describe('removeOptimizedImageAsset -- versioned folder recognition regression matrix', () => {
        it('recursively removes a manually-constructed -v2- asset folder', async () => {
            const assetFolder = 'item-50-1700000000000-v2-deadbeef';
            const assetDir = path.join(uploadsRoot, 'storefront-catalog', 'tenant-matrix', assetFolder);
            await fs.mkdir(assetDir, { recursive: true });
            await fs.writeFile(path.join(assetDir, 'large.webp'), 'bytes');

            await removeOptimizedImageAsset({
                uploadsRoot,
                storedPath: `storefront-catalog/tenant-matrix/${assetFolder}/large.webp`
            });

            await expect(fs.access(assetDir)).rejects.toThrow();
        });

        it('recursively removes a manually-constructed -v3- asset folder', async () => {
            const assetFolder = 'item-51-1700000000000-v3-deadbeef';
            const assetDir = path.join(uploadsRoot, 'storefront-catalog', 'tenant-matrix', assetFolder);
            await fs.mkdir(assetDir, { recursive: true });
            await fs.writeFile(path.join(assetDir, 'large.webp'), 'bytes');

            await removeOptimizedImageAsset({
                uploadsRoot,
                storedPath: `storefront-catalog/tenant-matrix/${assetFolder}/large.webp`
            });

            await expect(fs.access(assetDir)).rejects.toThrow();
        });
    });

    describe('classifyImageAsset precedence -- sourceMimeHint > metadata alpha > reportedMime', () => {
        it('falls through to reportedMime when hint and metadata are both absent (unchanged today)', () => {
            expect(classifyImageAsset({ reportedMime: 'image/webp' })).toBe('photo');
        });

        it('sourceMimeHint overrides reportedMime (mime says photo, hint says graphic)', () => {
            expect(classifyImageAsset({ reportedMime: 'image/webp', sourceMimeHint: 'image/png' })).toBe('graphic');
        });

        it('sourceMimeHint overrides reportedMime the other direction (mime says graphic, hint says photo)', () => {
            expect(classifyImageAsset({ reportedMime: 'image/png', sourceMimeHint: 'image/jpeg' })).toBe('photo');
        });

        it('metadata alpha heuristic promotes a photo mime to graphic when hint is absent', () => {
            expect(classifyImageAsset({ reportedMime: 'image/webp', metadata: { hasAlpha: true } })).toBe('graphic');
        });

        it('metadata present without alpha falls through unchanged', () => {
            expect(classifyImageAsset({ reportedMime: 'image/webp', metadata: { hasAlpha: false } })).toBe('photo');
        });

        it('an unrecognized hint is ignored, falling through to the metadata heuristic rather than straight to mime', () => {
            expect(classifyImageAsset({
                reportedMime: 'image/webp',
                sourceMimeHint: 'image/heic',
                metadata: { hasAlpha: true }
            })).toBe('graphic');
        });
    });

    // Phase 297 (#265): regression test for the reordering bug section 1 of the corrected plan
    // found -- storeOptimizedImageAsset used to call classifyImageAsset({ reportedMime }) BEFORE
    // fetching metadata(), so the alpha heuristic (and sourceMimeHint) could never actually reach
    // it. This asserts the *effect* of correct wiring end-to-end: an alpha PNG upload with no
    // sourceMimeHint classifies as 'graphic' purely from the now-available metadata, and a
    // photographic JPEG whose sourceMimeHint disagrees with its own reportedMime is reclassified
    // per the hint -- neither would be possible if metadata still arrived after classification.
    describe('storeOptimizedImageAsset -- classification ordering (Phase 297, #265)', () => {
        it('classifies an alpha PNG as graphic via the metadata heuristic (metadata now available before classify)', async () => {
            const tempPath = path.join(uploadsRoot, 'upload-alpha.png');
            await sharp({
                create: { width: 800, height: 600, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 0.5 } }
            }).png().toFile(tempPath);

            const stored = await storeOptimizedImageAsset({
                uploadsRoot,
                surfaceFolder: 'storefront-catalog',
                scopeSegments: ['tenant-ordering'],
                assetBaseName: 'item-70',
                originalName: 'alpha.png',
                // Deliberately a photo-classified reportedMime -- without the reorder, this alone
                // would decide classification and this test would see 'photo', not 'graphic'.
                reportedMime: 'image/webp',
                tempPath
            });

            expect(stored.classification).toBe('graphic');
            expect(stored.path).toMatch(/large\.png$/);
        });

        it('applies sourceMimeHint over reportedMime end-to-end', async () => {
            const tempPath = path.join(uploadsRoot, 'upload-hinted.jpg');
            await sharp({
                create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 180, b: 160 } }
            }).jpeg({ quality: 90 }).toFile(tempPath);

            const stored = await storeOptimizedImageAsset({
                uploadsRoot,
                surfaceFolder: 'storefront-catalog',
                scopeSegments: ['tenant-ordering'],
                assetBaseName: 'item-71',
                originalName: 'hinted.jpg',
                reportedMime: 'image/jpeg',
                tempPath,
                sourceMimeHint: 'image/png'
            });

            expect(stored.classification).toBe('graphic');
            expect(stored.path).toMatch(/large\.png$/);
            expect(stored.original.source_mime_hint).toBe('image/png');
        });
    });

    // Phase 297 (#265): the accepted-large fast path -- a client-supplied `image` that already
    // matches the large-delivery contract (correct format, width, pixel cap, and delivery byte
    // cap) is copied into place instead of re-encoded; medium/thumbnail are then derived from that
    // accepted large via deriveVariantsFromAcceptedLarge, this function's first real caller.
    describe('storeOptimizedImageAsset -- accepted-large path (Phase 297, #265)', () => {
        it('accepts an already-optimized large, derives medium/thumbnail from it, and records provenance', async () => {
            const tempPath = path.join(uploadsRoot, 'upload-accepted-large.webp');
            await sharp({
                create: { width: 1920, height: 1080, channels: 3, background: { r: 30, g: 60, b: 90 } }
            }).webp({ quality: 85 }).toFile(tempPath);

            const stored = await storeOptimizedImageAsset({
                uploadsRoot,
                surfaceFolder: 'storefront-catalog',
                scopeSegments: ['tenant-accepted-large'],
                assetBaseName: 'item-72',
                originalName: 'accepted-large.webp',
                reportedMime: 'image/webp',
                tempPath,
                acceptedAsClientLarge: true
            });

            expect(stored.original_source).toBe('client_optimized');
            expect(stored.provenance).toEqual({ large: 'client', medium: 'server', thumbnail: 'server' });
            expect(stored.variants.large.width).toBe(1920);
            expect(stored.variants.medium.width).toBeLessThanOrEqual(1024);
            expect(stored.variants.thumbnail.width).toBeLessThanOrEqual(400);

            const manifestRaw = await fs.readFile(path.join(uploadsRoot, path.dirname(stored.path), 'asset.json'), 'utf8');
            const manifest = JSON.parse(manifestRaw);
            expect(manifest.provenance).toEqual({ large: 'client', medium: 'server', thumbnail: 'server' });
        });

        it('falls back to full server derivation when the accepted-large claim fails validation (wrong width)', async () => {
            const tempPath = path.join(uploadsRoot, 'upload-rejected-large.webp');
            await sharp({
                create: { width: 3000, height: 2000, channels: 3, background: { r: 30, g: 60, b: 90 } }
            }).webp({ quality: 85 }).toFile(tempPath);

            const stored = await storeOptimizedImageAsset({
                uploadsRoot,
                surfaceFolder: 'storefront-catalog',
                scopeSegments: ['tenant-rejected-large'],
                assetBaseName: 'item-73',
                originalName: 'rejected-large.webp',
                reportedMime: 'image/webp',
                tempPath,
                acceptedAsClientLarge: true
            });

            expect(stored.original_source).toBe('server_derived');
            expect(stored.provenance).toEqual({ large: 'server', medium: 'server', thumbnail: 'server' });
            expect(stored.variants.large.width).toBeLessThanOrEqual(1920);
        });

        it('uses a validated client-supplied medium/thumbnail directly instead of re-deriving them', async () => {
            const tempPath = path.join(uploadsRoot, 'upload-with-variants.jpg');
            await sharp({
                create: { width: 2400, height: 1600, channels: 3, background: { r: 90, g: 90, b: 90 } }
            }).jpeg({ quality: 92 }).toFile(tempPath);

            const mediumTempPath = path.join(uploadsRoot, 'client-medium.webp');
            await sharp({
                create: { width: 1024, height: 683, channels: 3, background: { r: 91, g: 91, b: 91 } }
            }).webp({ quality: 80 }).toFile(mediumTempPath);

            const thumbnailTempPath = path.join(uploadsRoot, 'client-thumb.webp');
            await sharp({
                create: { width: 400, height: 267, channels: 3, background: { r: 92, g: 92, b: 92 } }
            }).webp({ quality: 80 }).toFile(thumbnailTempPath);

            const stored = await storeOptimizedImageAsset({
                uploadsRoot,
                surfaceFolder: 'storefront-catalog',
                scopeSegments: ['tenant-client-variants'],
                assetBaseName: 'item-74',
                originalName: 'with-variants.jpg',
                reportedMime: 'image/jpeg',
                tempPath,
                clientVariantFiles: {
                    medium: { tempPath: mediumTempPath },
                    thumbnail: { tempPath: thumbnailTempPath }
                }
            });

            expect(stored.original_source).toBe('server_derived');
            expect(stored.provenance).toEqual({ large: 'server', medium: 'client', thumbnail: 'client' });
            expect(stored.variants.medium.width).toBe(1024);
            expect(stored.variants.thumbnail.width).toBe(400);
            // The client-supplied temp files are consumed (copied + unlinked), not left behind.
            await expect(fs.access(mediumTempPath)).rejects.toThrow();
            await expect(fs.access(thumbnailTempPath)).rejects.toThrow();
        });

        it('discards an invalid client-supplied variant and falls back to server derivation for it', async () => {
            const tempPath = path.join(uploadsRoot, 'upload-bad-variant.jpg');
            await sharp({
                create: { width: 2400, height: 1600, channels: 3, background: { r: 90, g: 90, b: 90 } }
            }).jpeg({ quality: 92 }).toFile(tempPath);

            // Wrong format for a photo-classified upload (server expects webp for `medium`).
            const badMediumTempPath = path.join(uploadsRoot, 'client-medium-bad.png');
            await sharp({
                create: { width: 1024, height: 683, channels: 3, background: { r: 91, g: 91, b: 91 } }
            }).png().toFile(badMediumTempPath);

            const stored = await storeOptimizedImageAsset({
                uploadsRoot,
                surfaceFolder: 'storefront-catalog',
                scopeSegments: ['tenant-bad-variant'],
                assetBaseName: 'item-75',
                originalName: 'bad-variant.jpg',
                reportedMime: 'image/jpeg',
                tempPath,
                clientVariantFiles: {
                    medium: { tempPath: badMediumTempPath }
                }
            });

            expect(stored.provenance.medium).toBe('server');
            expect(stored.variants.medium.width).toBeLessThanOrEqual(1024);
            await expect(fs.access(badMediumTempPath)).rejects.toThrow();
        });
    });

    describe('deriveVariantsFromAcceptedLarge', () => {
        it('derives medium/thumbnail variants in the requested formats from an accepted large file', async () => {
            const assetId = 'item-60-1700000000000-v3-cafebabe';
            const publicAssetDir = path.join(uploadsRoot, 'storefront-catalog', 'tenant-smoke', assetId);
            await fs.mkdir(publicAssetDir, { recursive: true });
            const acceptedLargePath = path.join(publicAssetDir, 'large.jpg');
            await sharp({
                create: {
                    width: 1920,
                    height: 1080,
                    channels: 3,
                    background: { r: 10, g: 20, b: 30 }
                }
            }).jpeg({ quality: 90 }).toFile(acceptedLargePath);

            const result = await deriveVariantsFromAcceptedLarge({
                acceptedLargePath,
                publicAssetDir,
                normalizedSurface: 'storefront-catalog',
                normalizedScopeSegments: ['tenant-smoke'],
                assetId,
                deliveryFormats: [{ ext: '.webp', encoder: 'webp' }],
                sourceWidth: 1920
            });

            expect(result.webp.medium).toBeDefined();
            expect(result.webp.thumbnail).toBeDefined();
            expect(result.webp.medium.url).toMatch(/\/medium\.webp$/);
            expect(result.webp.thumbnail.url).toMatch(/\/thumb\.webp$/);
            await expect(fs.access(path.join(publicAssetDir, 'medium.webp'))).resolves.toBeUndefined();
            await expect(fs.access(path.join(publicAssetDir, 'thumb.webp'))).resolves.toBeUndefined();
        });
    });
});
