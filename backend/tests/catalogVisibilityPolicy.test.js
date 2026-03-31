import {
    isDefaultCatalogVisible,
    resolveCatalogVisibility,
    isCatalogItemVisible
} from '../src/modules/shared/utils/catalogVisibilityPolicy.js';

describe('catalogVisibilityPolicy', () => {
    it('defaults to visible only for finished goods products', () => {
        expect(isDefaultCatalogVisible({ category: 'product', product_type: 'finished_goods' })).toBe(true);
        expect(isDefaultCatalogVisible({ category: 'product', product_type: 'work_in_progress' })).toBe(false);
        expect(isDefaultCatalogVisible({ category: 'ingredient', product_type: null })).toBe(false);
    });

    it('lets explicit override take precedence over default policy', () => {
        const item = { category: 'ingredient', product_type: null };
        expect(resolveCatalogVisibility({ item, override: { pos_visible: true } })).toBe(true);
        expect(resolveCatalogVisibility({ item, override: { pos_visible: false } })).toBe(false);
    });

    it('reads override from associated posCatalogOverride on row payload', () => {
        const hidden = {
            category: 'product',
            product_type: 'finished_goods',
            posCatalogOverride: { pos_visible: false }
        };
        const visible = {
            category: 'ingredient',
            product_type: null,
            posCatalogOverride: { pos_visible: true }
        };
        expect(isCatalogItemVisible(hidden)).toBe(false);
        expect(isCatalogItemVisible(visible)).toBe(true);
    });

    it('falls back to default policy when no override is present on row payload', () => {
        expect(isCatalogItemVisible({
            category: 'product',
            product_type: 'finished_goods',
            posCatalogOverride: null
        })).toBe(true);
        expect(isCatalogItemVisible({
            category: 'ingredient',
            product_type: null,
            posCatalogOverride: null
        })).toBe(false);
    });
});
