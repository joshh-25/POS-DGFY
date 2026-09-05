import { describe, expect, it, jest } from '@jest/globals';
import { buildListPosCatalogUseCase } from '../src/modules/pos/usecases/posUseCases.js';

const rows = Array.from({ length: 600 }, (_, index) => ({
    item_id: index + 1,
    name: `A product ${String(index + 1).padStart(3, '0')}`,
    sku_code: `SKU-${index + 1}`,
    current_stock: 10,
    pos_visible: true
})).concat({
    item_id: 601,
    name: 'Tomato Meatballs',
    sku_code: 'MEAT-601',
    current_stock: 10,
    pos_visible: true
});

const buildDiagnosticUseCase = (catalogRows = rows) => {
    const listCatalog = jest.fn(async ({ search = '', limit = 100 }) => {
        const normalizedSearch = String(search).toLowerCase();
        return catalogRows
            .filter((item) => !normalizedSearch
                || item.name.toLowerCase().includes(normalizedSearch)
                || item.sku_code.toLowerCase().includes(normalizedSearch))
            .slice(0, limit);
    });
    return {
        listCatalog,
        useCase: buildListPosCatalogUseCase({
            posRepository: { listCatalog },
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: null })
        })
    };
};

describe('Phase 296 POS catalog search-gap diagnostic', () => {
    it('reproduces an item outside the Items 200-row preload appearing in API search', async () => {
        const { listCatalog, useCase } = buildDiagnosticUseCase();

        const itemsPreload = await useCase({ query: { search: '', limit: 200 }, user: { user_id: 1 } });
        const sellSearch = await useCase({ query: { search: 'meat', limit: 200 }, user: { user_id: 1 } });

        expect(itemsPreload.success).toBe(true);
        expect(itemsPreload.data).toHaveLength(200);
        expect(itemsPreload.data.some((item) => item.item_id === 601)).toBe(false);
        expect(sellSearch.success).toBe(true);
        expect(sellSearch.data.map((item) => item.item_id)).toEqual([601]);
        expect(listCatalog).toHaveBeenNthCalledWith(1, expect.objectContaining({ search: '', limit: 200 }));
        expect(listCatalog).toHaveBeenNthCalledWith(2, expect.objectContaining({ search: 'meat', limit: 200 }));
    });

    it('confirms post-limit POS visibility filtering can leave eligible rows beyond the limit unreachable', async () => {
        const visibilityRows = rows.map((item) => ({
            ...item,
            pos_visible: item.item_id > 200
        }));
        const { useCase } = buildDiagnosticUseCase(visibilityRows);

        const result = await useCase({ query: { search: '', limit: 200 }, user: { user_id: 1 } });

        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
        expect(visibilityRows.some((item) => item.item_id > 200 && item.pos_visible)).toBe(true);
    });
});
