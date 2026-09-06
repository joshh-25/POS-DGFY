import {
    getSkuStem,
    parseBulkCatalogFilename,
    groupBulkCatalogFilesBySku
} from '../src/modules/shared/utils/bulkCatalogImageFilename.js';

// Phase 301 (#265): the corrected plan's own instruction -- extend the existing SKU-stem
// convention with a <SKU>__<variant>.<ext> suffix, never replace it with an arbitrary
// client_ref. A bare <SKU>.<ext> with no suffix must keep working identically to today.
describe('bulkCatalogImageFilename util', () => {
    describe('parseBulkCatalogFilename', () => {
        it('parses a bare filename (today\'s format) as skuCode with no variant suffix', () => {
            expect(parseBulkCatalogFilename({ originalname: 'SKU-001.jpg' })).toEqual({
                skuCode: 'SKU-001',
                variantKey: null
            });
        });

        it('parses the new <SKU>__large.<ext> suffix', () => {
            expect(parseBulkCatalogFilename({ originalname: 'SKU-001__large.webp' })).toEqual({
                skuCode: 'SKU-001',
                variantKey: 'large'
            });
        });

        it('parses <SKU>__medium.<ext> and <SKU>__thumbnail.<ext>', () => {
            expect(parseBulkCatalogFilename({ originalname: 'SKU-001__medium.webp' })).toEqual({
                skuCode: 'SKU-001',
                variantKey: 'medium'
            });
            expect(parseBulkCatalogFilename({ originalname: 'SKU-001__thumbnail.webp' })).toEqual({
                skuCode: 'SKU-001',
                variantKey: 'thumbnail'
            });
        });

        it('is case-insensitive on the variant suffix', () => {
            expect(parseBulkCatalogFilename({ originalname: 'SKU-001__LARGE.webp' })).toEqual({
                skuCode: 'SKU-001',
                variantKey: 'large'
            });
        });

        it('falls back to whole-stem-as-SKU when the __ suffix is not a known variant key', () => {
            expect(parseBulkCatalogFilename({ originalname: 'SKU__foo.jpg' })).toEqual({
                skuCode: 'SKU__foo',
                variantKey: null
            });
        });

        it('falls back to whole-stem-as-SKU when a SKU legitimately contains a leading __', () => {
            // getSkuStem itself agrees this is the whole stem -- confirms the two helpers
            // never disagree about what "the stem" is.
            expect(getSkuStem({ originalname: '__ODD.jpg' })).toBe('__ODD');
            expect(parseBulkCatalogFilename({ originalname: '__ODD.jpg' })).toEqual({
                skuCode: '__ODD',
                variantKey: null
            });
        });
    });

    describe('groupBulkCatalogFilesBySku', () => {
        it('groups a bare SKU.jpg into its own single-file group (today\'s format, unchanged)', () => {
            const files = [{ originalname: 'SKU-100.jpg' }];
            const { bySku, duplicateReasonBySku, groupOrder } = groupBulkCatalogFilesBySku(files);

            expect(groupOrder).toEqual(['SKU-100']);
            expect(duplicateReasonBySku.size).toBe(0);
            expect(bySku.get('SKU-100').slots.large).toHaveLength(1);
            expect(bySku.get('SKU-100').slots.medium).toHaveLength(0);
            expect(bySku.get('SKU-100').slots.thumbnail).toHaveLength(0);
        });

        it('groups <SKU>__large/medium/thumbnail siblings into one group', () => {
            const large = { originalname: 'SKU-200__large.webp' };
            const medium = { originalname: 'SKU-200__medium.webp' };
            const thumbnail = { originalname: 'SKU-200__thumbnail.webp' };
            const { bySku, duplicateReasonBySku, groupOrder } = groupBulkCatalogFilesBySku([large, medium, thumbnail]);

            expect(groupOrder).toEqual(['SKU-200']);
            expect(duplicateReasonBySku.size).toBe(0);
            expect(bySku.get('SKU-200').slots).toEqual({ large: [large], medium: [medium], thumbnail: [thumbnail] });
        });

        it('flags two bare files sharing a stem as duplicate_filename (today\'s behavior, unchanged)', () => {
            const files = [{ originalname: 'SKU-300.jpg' }, { originalname: 'SKU-300.png' }];
            const { duplicateReasonBySku } = groupBulkCatalogFilesBySku(files);

            expect(duplicateReasonBySku.get('SKU-300')).toBe('duplicate_filename');
        });

        it('flags two <SKU>__large files for the same SKU as duplicate_variant_for_sku', () => {
            const files = [
                { originalname: 'SKU-400__large.webp' },
                { originalname: 'SKU-400__large.jpg' }
            ];
            const { duplicateReasonBySku } = groupBulkCatalogFilesBySku(files);

            expect(duplicateReasonBySku.get('SKU-400')).toBe('duplicate_variant_for_sku');
        });

        it('flags a bare file plus an explicit __large file for the same SKU as duplicate_variant_for_sku', () => {
            const files = [
                { originalname: 'SKU-401.jpg' },
                { originalname: 'SKU-401__large.webp' }
            ];
            const { duplicateReasonBySku } = groupBulkCatalogFilesBySku(files);

            expect(duplicateReasonBySku.get('SKU-401')).toBe('duplicate_variant_for_sku');
        });

        it('flags two medium files for the same SKU as duplicate_variant_for_sku', () => {
            const files = [
                { originalname: 'SKU-500__medium.webp' },
                { originalname: 'SKU-500__medium.jpg' }
            ];
            const { duplicateReasonBySku } = groupBulkCatalogFilesBySku(files);

            expect(duplicateReasonBySku.get('SKU-500')).toBe('duplicate_variant_for_sku');
        });

        it('keeps distinct SKUs in separate groups regardless of variant suffixes', () => {
            const files = [
                { originalname: 'SKU-600.jpg' },
                { originalname: 'SKU-601__large.webp' },
                { originalname: 'SKU-601__medium.webp' }
            ];
            const { groupOrder, duplicateReasonBySku } = groupBulkCatalogFilesBySku(files);

            expect(groupOrder).toEqual(['SKU-600', 'SKU-601']);
            expect(duplicateReasonBySku.size).toBe(0);
        });
    });
});
