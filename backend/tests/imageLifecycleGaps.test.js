import {
    IMAGE_LIFECYCLE_STATES,
    IMAGE_SEMANTIC_VARIANTS,
    inspectImageLifecycleState,
    resolveSemanticImageUrl,
    isExternalImageUrl
} from '../src/modules/inventory/contracts/imageLifecycleContract.js';

describe('Image Lifecycle Contract & Gap Tests', () => {
    describe('Image State Inspection', () => {
        test('identifies missing image state when no URL or path is present', () => {
            const state = inspectImageLifecycleState({});
            expect(state).toBe(IMAGE_LIFECYCLE_STATES.MISSING);
        });

        test('identifies external image URLs', () => {
            expect(isExternalImageUrl('https://external-cdn.com/product.jpg')).toBe(true);
            expect(isExternalImageUrl('/uploads/storefront/item-1.png')).toBe(false);
            expect(isExternalImageUrl('http://localhost:3000/uploads/item.png')).toBe(false);

            const state = inspectImageLifecycleState({
                storedUrl: 'https://external-cdn.com/product.jpg'
            });
            expect(state).toBe(IMAGE_LIFECYCLE_STATES.EXTERNAL);
        });

        test('identifies legacy image state when metadata or responsive manifest is missing', () => {
            const state = inspectImageLifecycleState({
                storedPath: 'storefront-catalog/item-1.png',
                storedUrl: '/uploads/storefront-catalog/item-1.png',
                metadata: null
            });
            expect(state).toBe(IMAGE_LIFECYCLE_STATES.LEGACY);
        });

        test('identifies optimized image state when optimization_version is 2 and status is optimized', () => {
            const state = inspectImageLifecycleState({
                storedPath: 'storefront-catalog/item-1-v2-1234/large.png',
                storedUrl: '/uploads/storefront-catalog/item-1-v2-1234/large.png',
                metadata: {
                    optimization_version: 2,
                    processing_status: 'optimized'
                }
            });
            expect(state).toBe(IMAGE_LIFECYCLE_STATES.OPTIMIZED);
        });

        test('identifies replaced image state when a new file upload is provided', () => {
            const state = inspectImageLifecycleState({
                storedPath: 'storefront-catalog/item-1.png',
                storedUrl: '/uploads/storefront-catalog/item-1.png',
                file: { originalname: 'new-photo.jpg', path: '/tmp/upload-123' }
            });
            expect(state).toBe(IMAGE_LIFECYCLE_STATES.REPLACED);
        });
    });

    describe('Semantic Variant Resolution', () => {
        test('resolves correct semantic variant from variant_metadata', () => {
            const item = {
                variant_metadata: {
                    thumbnail: { url: '/uploads/storefront/item-1/thumb.webp' },
                    catalog_card: { url: '/uploads/storefront/item-1/medium.webp' },
                    checkout: { url: '/uploads/storefront/item-1/thumb.webp' },
                    preview: { url: '/uploads/storefront/item-1/large.webp' }
                }
            };

            expect(resolveSemanticImageUrl(item, IMAGE_SEMANTIC_VARIANTS.THUMBNAIL))
                .toBe('/uploads/storefront/item-1/thumb.webp');
            expect(resolveSemanticImageUrl(item, IMAGE_SEMANTIC_VARIANTS.CATALOG_CARD))
                .toBe('/uploads/storefront/item-1/medium.webp');
            expect(resolveSemanticImageUrl(item, IMAGE_SEMANTIC_VARIANTS.CHECKOUT))
                .toBe('/uploads/storefront/item-1/thumb.webp');
            expect(resolveSemanticImageUrl(item, IMAGE_SEMANTIC_VARIANTS.PREVIEW))
                .toBe('/uploads/storefront/item-1/large.webp');
        });

        test('falls back to legacy storefront_image_url or pos_image_url when semantic variants are absent', () => {
            const item = {
                storefront_image_url: '/uploads/legacy-item.png',
                pos_image_url: '/uploads/pos-item.png'
            };

            expect(resolveSemanticImageUrl(item, IMAGE_SEMANTIC_VARIANTS.CATALOG_CARD))
                .toBe('/uploads/legacy-item.png');
            expect(resolveSemanticImageUrl(item, IMAGE_SEMANTIC_VARIANTS.CHECKOUT))
                .toBe('/uploads/legacy-item.png');
        });

        test('returns null gracefully when no image URLs are available', () => {
            expect(resolveSemanticImageUrl({})).toBeNull();
        });
    });
});
