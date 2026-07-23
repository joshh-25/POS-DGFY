import { describe, expect, it } from '@jest/globals';
import { auditGrandMatadorCatalog } from '../src/modules/storefrontDomains/migration/grandMatadorCatalogAudit.js';

describe('Grand Matador catalog migration audit', () => {
    it('deduplicates paginated categories and products and reports migration-sensitive fields', () => {
        const category = { id: 1, name: 'Beef', slug: 'beef' };
        const product = {
            id: 10,
            category_id: 1,
            name: 'Ribeye',
            slug: 'ribeye',
            base_price: '950.00',
            inventory_quantity: 12,
            images: ['/images/ribeye.png'],
            variants: [{ id: 1 }],
            weight_options: [{ id: 2 }],
            addons: [{ id: 3 }]
        };
        const report = auditGrandMatadorCatalog([
            { categories: [category], products: { data: [product] } },
            { categories: [category], products: { data: [product] } }
        ]);
        expect(report.counts).toEqual({ categories: 1, products: 1, variants: 1, weight_options: 1, addons: 1, images: 1 });
        expect(report.import_ready).toBe(true);
        expect(report.findings).toContainEqual(expect.objectContaining({ code: 'RELATIVE_IMAGE_REQUIRES_COPY' }));
    });

    it('blocks import when product identity or category references are invalid', () => {
        const report = auditGrandMatadorCatalog([{ categories: [], products: { data: [{ id: 1, name: 'Broken', base_price: '-1' }] } }]);
        expect(report.import_ready).toBe(false);
        expect(report.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
            'PRODUCT_SLUG_MISSING', 'CATEGORY_REFERENCE_MISSING', 'BASE_PRICE_INVALID'
        ]));
    });
});
