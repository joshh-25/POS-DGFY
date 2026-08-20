import { describe, expect, it } from 'vitest';
import {
    buildCatalogRequestKey,
    buildCatalogRequestParams,
    CATALOG_GRID_GAP_PX,
    filterAvailableCatalog,
    filterAvailableCatalogFolders,
    filterCatalogByFolder,
    getCatalogGridMeasurement,
    getCatalogPageSize,
    getNextCatalogImageUrls,
    getTotalCatalogPages,
    getVisibleCatalogItems,
    getVisibleCatalogRange,
    normalizePosFolders
} from '../posCatalogWorkflow.js';

describe('POS catalog workflow utilities', () => {
    it('normalizes folders and keeps only sellable POS catalog items', () => {
        expect(normalizePosFolders([
            { folder_id: '20', name: 'Z Drinks' },
            { folder_id: '10', name: 'A Food' },
            { folder_id: '30', name: 'Hidden', show_in_pos_filter: false },
            { folder_id: 'invalid', name: 'Invalid' }
        ])).toEqual([
            { folder_id: 10, name: 'A Food' },
            { folder_id: 20, name: 'Z Drinks' }
        ]);

        const available = filterAvailableCatalog([
            { item_id: 1, current_stock: 2, folder_id: 10 },
            { item_id: 2, current_stock: 0, folder_id: 10 },
            { item_id: 3, category: 'service', current_stock: 0, folder_id: 20 },
            { item_id: 4, pos_always_available: true, current_stock: 0, folder_id: 20 }
        ]);
        expect(available.map((item) => item.item_id)).toEqual([1, 3, 4]);
        expect(filterAvailableCatalogFolders([
            { folder_id: 10, name: 'Food' },
            { folder_id: 20, name: 'Services' },
            { folder_id: 30, name: 'Empty' }
        ], available).map((folder) => folder.folder_id)).toEqual([10, 20]);
    });

    it('filters folders, paginates predictably, and reports the visible range', () => {
        const catalog = [
            { item_id: 1, folder_id: 10 },
            { item_id: 2, folder_id: 20 },
            { item_id: 3, folder_id: 10 },
            { item_id: 4, folder_id: 10 }
        ];
        expect(filterCatalogByFolder(catalog, 20)).toEqual([{ item_id: 2, folder_id: 20 }]);
        expect(filterCatalogByFolder(catalog, null)).toEqual(catalog);
        expect(getCatalogPageSize(4)).toBe(8);
        expect(getTotalCatalogPages(17, 8)).toBe(3);
        expect(getVisibleCatalogItems(catalog, 2, 2)).toEqual([
            { item_id: 3, folder_id: 10 },
            { item_id: 4, folder_id: 10 }
        ]);
        expect(getVisibleCatalogRange(17, 2, 8, 8)).toEqual({ start: 9, end: 16 });
        expect(getVisibleCatalogRange(0, 1, 8, 0)).toEqual({ start: 0, end: 0 });
    });

    it('deduplicates next-page image preloads and preserves request parameters', () => {
        const catalog = [
            { item_id: 1, storefront_image_variants: { thumbnail_url: 'https://cdn.test/a.jpg' } },
            { item_id: 2, storefront_image_variants: { thumbnail_url: 'https://cdn.test/b.jpg' } },
            { item_id: 3, storefront_image_variants: { thumbnail_url: 'https://cdn.test/a.jpg' } }
        ];
        expect(getNextCatalogImageUrls(catalog, 1, 2, 2)).toEqual([
            'https://cdn.test/a.jpg'
        ]);
        expect(getNextCatalogImageUrls(catalog, 2, 2, 2)).toEqual([]);
        expect(buildCatalogRequestKey('  coffee ', 7)).toBe('coffee::7');
        expect(buildCatalogRequestParams('', 7)).toEqual({ search: '', limit: 200, location_id: 7 });
        expect(buildCatalogRequestParams('coffee', null)).toEqual({ search: 'coffee', limit: 200 });
    });

    it('keeps desktop, POS tablet, and mobile grid measurements stable', () => {
        expect(getCatalogGridMeasurement({
            width: 400,
            height: 400,
            isMobileViewport: false,
            isTabletViewport: false,
            isDgfyPosSurface: false,
            textSizeScale: 1
        })).toEqual({ columns: 2, rows: 2, pageSize: 4, minimumCardWidth: 176, cardHeight: 176, textSizeScale: 1 });
        expect(getCatalogGridMeasurement({
            width: 400,
            height: 400,
            isMobileViewport: false,
            isTabletViewport: true,
            isDgfyPosSurface: true,
            textSizeScale: 1.1
        })).toMatchObject({ minimumCardWidth: 176, cardHeight: 123, textSizeScale: 1.1 });
        expect(getCatalogGridMeasurement({
            width: 320,
            height: 400,
            isMobileViewport: true,
            isTabletViewport: false,
            isDgfyPosSurface: true,
            textSizeScale: 1
        })).toMatchObject({ columns: 1, rows: 3, pageSize: 3, minimumCardWidth: 320, cardHeight: 120 });
        expect(CATALOG_GRID_GAP_PX).toBe(8);
    });
});
