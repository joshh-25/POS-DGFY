import {
    isDefaultCatalogVisible,
    isServiceCatalogVisible,
    resolveCatalogVisibility,
    resolveStorefrontCatalogVisibility,
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

    it('lets storefront override take precedence over legacy POS-derived storefront visibility', () => {
        const item = { category: 'product', product_type: 'finished_goods' };
        expect(resolveStorefrontCatalogVisibility({
            item,
            override: { storefront_visible: false },
            legacyPosOverride: { pos_visible: true }
        })).toBe(false);
        expect(resolveStorefrontCatalogVisibility({
            item: { category: 'raw_material', product_type: null },
            override: { storefront_visible: true },
            legacyPosOverride: { pos_visible: false }
        })).toBe(true);
    });

    it('keeps legacy POS-derived storefront fallback when storefront override is absent', () => {
        const item = { category: 'product', product_type: 'finished_goods' };
        expect(resolveStorefrontCatalogVisibility({
            item,
            override: null,
            legacyPosOverride: { pos_visible: false }
        })).toBe(false);
    });

    it('reads associated storefrontCatalogOverride before associated posCatalogOverride on storefront rows', () => {
        expect(isCatalogItemVisible({
            category: 'product',
            product_type: 'finished_goods',
            storefrontCatalogOverride: { storefront_visible: false },
            posCatalogOverride: { pos_visible: true }
        })).toBe(false);
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

    it('shows bookable storefront services without manufacturing product defaults', () => {
        expect(isServiceCatalogVisible({
            category: 'service',
            serviceDetail: {
                bookable: true,
                visible_in_storefront: true
            }
        })).toBe(true);
        expect(isCatalogItemVisible({
            category: 'service',
            product_type: null,
            serviceDetail: {
                bookable: true,
                visible_in_storefront: true
            },
            posCatalogOverride: null
        })).toBe(true);
        expect(isCatalogItemVisible({
            category: 'service',
            product_type: null,
            serviceDetail: {
                bookable: true,
                visible_in_storefront: false
            },
            posCatalogOverride: null
        })).toBe(false);
        expect(isCatalogItemVisible({
            category: 'service',
            product_type: null,
            posCatalogOverride: null
        })).toBe(false);
    });

    it('uses POS visibility for services on POS catalog surfaces', () => {
        const service = {
            category: 'service',
            product_type: null,
            serviceDetail: {
                bookable: true,
                visible_in_pos: true,
                visible_in_storefront: false
            },
            posCatalogOverride: null
        };

        expect(isServiceCatalogVisible(service, { surface: 'pos' })).toBe(true);
        expect(resolveCatalogVisibility({ item: service, surface: 'pos' })).toBe(true);
        expect(resolveCatalogVisibility({ item: {
            ...service,
            serviceDetail: {
                ...service.serviceDetail,
                visible_in_pos: false,
                visible_in_storefront: true
            }
        }, surface: 'pos' })).toBe(false);
    });
});
