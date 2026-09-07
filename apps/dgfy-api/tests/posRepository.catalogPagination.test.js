import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';

afterEach(() => jest.restoreAllMocks());

describe('POS Items management catalog pagination', () => {
    it('excludes POS-hidden items from page results and totals', async () => {
        const listCatalog = jest.spyOn(posRepository, 'listCatalog').mockResolvedValueOnce({
            data: [
                {
                    item_id: 1,
                    name: 'Visible Product',
                    current_stock: 10,
                    pos_visible: true,
                    secondary_folder_ids: []
                },
                {
                    item_id: 2,
                    name: 'Hidden Product',
                    current_stock: 10,
                    pos_visible: false,
                    secondary_folder_ids: []
                }
            ],
            scanned_count: 2
        });

        const result = await posRepository.listCatalogPage({ page: 1, page_size: 1 });

        expect(result.items.map((item) => item.item_id)).toEqual([1]);
        expect(result.pagination).toEqual({ page: 1, page_size: 1, total: 1, total_pages: 1 });
        expect(listCatalog).toHaveBeenCalledTimes(1);
    });

    it('searches enriched rows beyond 500 and returns a stable page total', async () => {
        const firstBatch = Array.from({ length: 500 }, (_, index) => ({
            item_id: index + 1,
            name: `A product ${index + 1}`,
            sku_code: `SKU-${index + 1}`,
            current_stock: 10,
            pos_visible: true,
            secondary_folder_ids: []
        }));
        const secondBatch = [{
            item_id: 601,
            name: 'Tomato Meatballs',
            sku_code: 'MEAT-601',
            current_stock: 10,
            pos_visible: true,
            secondary_folder_ids: [8],
            primary_barcode: { code: 'MEAT-BARCODE' }
        }];
        const listCatalog = jest.spyOn(posRepository, 'listCatalog')
            .mockResolvedValueOnce({ data: firstBatch, scanned_count: 500 })
            .mockResolvedValueOnce({ data: secondBatch, scanned_count: 1 });

        const result = await posRepository.listCatalogPage({
            search: 'meat-barcode',
            category_filter: 'folder:8',
            stock_filter: 'in_stock',
            page: 1,
            page_size: 15,
            location_id: 4
        });

        expect(result.items.map((item) => item.item_id)).toEqual([601]);
        expect(result.pagination).toEqual({ page: 1, page_size: 15, total: 1, total_pages: 1 });
        expect(listCatalog).toHaveBeenNthCalledWith(2, expect.objectContaining({
            offset: 500,
            location_id: 4,
            with_scan_info: true
        }));
    });
});
