import { describe, expect, it } from '@jest/globals';
import { buildGrandMatadorCatalogImportPlan } from '../src/modules/storefrontDomains/migration/grandMatadorCatalogImport.js';
import { buildGrandMatadorReadyCatalogPages } from '../src/modules/storefrontDomains/migration/grandMatadorReadyCatalog.js';

describe('Grand Matador catalog import plan', () => {
    it('maps per-kilo prices into a default price and signed weight deltas', () => {
        const plan = buildGrandMatadorCatalogImportPlan([{
            categories: [{ id: 1, name: ' Beef ', slug: 'beef', is_active: true }],
            products: { data: [{
                id: 7,
                category_id: 1,
                slug: 'ribeye',
                name: 'Ribeye',
                base_price: '950.00',
                pricing_unit: 'kg',
                inventory_quantity: 12,
                images: ['/media/ribeye.png'],
                weight_options: [
                    { grams: 250, price_multiplier: '0.2500', is_default: false },
                    { grams: 500, price_multiplier: '0.5000', is_default: true },
                    { grams: 1000, price_multiplier: '1.0000', is_default: false }
                ],
                variants: [{ name: 'Sliced', price_adjustment: '25.00', is_active: true }],
                addons: [{ name: 'Marinated', price_adjustment: '20.00', is_active: true }]
            }] }
        }]);

        expect(plan.categories).toEqual([expect.objectContaining({ name: 'Beef' })]);
        expect(plan.products[0]).toEqual(expect.objectContaining({
            sku_code: 'GM-0007',
            default_sale_price: 475,
            current_stock: 12,
            images: ['https://api.grandmatador.com/media/ribeye.png']
        }));
        expect(plan.products[0].modifiers[0].options).toEqual([
            expect.objectContaining({ name: '250 g', price_delta: -237.5, is_default: false }),
            expect.objectContaining({ name: '500 g', price_delta: 0, is_default: true }),
            expect.objectContaining({ name: '1 kg', price_delta: 475, is_default: false })
        ]);
        expect(plan.products[0].modifiers.map((group) => group.display_name)).toEqual(['Weight', 'Cut', 'Add-ons']);
    });

    it('deduplicates pagination and uses the source base price when no weight choice exists', () => {
        const page = {
            categories: [{ id: 6, name: 'Whole Sale Products ', slug: 'whole-sale-products' }],
            products: { data: [{
                id: 24,
                category_id: 6,
                slug: 'pork-belly',
                name: 'Pork Belly',
                base_price: '1.00',
                inventory_quantity: 3,
                images: []
            }] }
        };
        const plan = buildGrandMatadorCatalogImportPlan([page, page]);
        expect(plan.categories).toHaveLength(1);
        expect(plan.categories[0].name).toBe('Whole Sale Products');
        expect(plan.products).toHaveLength(1);
        expect(plan.products[0].default_sale_price).toBe(1);
        expect(plan.products[0].modifiers).toEqual([]);
    });

    it('builds the approved ready-and-available replacement catalog', () => {
        const plan = buildGrandMatadorCatalogImportPlan(buildGrandMatadorReadyCatalogPages());
        const pricesByName = Object.fromEntries(
            plan.products.map((product) => [product.name, product.default_sale_price])
        );

        expect(plan.categories.map((category) => category.name)).toEqual(['Pork', 'Chicken', 'Beef']);
        expect(plan.products).toHaveLength(18);
        expect(plan.products.every((product) => (
            product.current_stock === 100
            && product.unit_of_measure === 'kg'
            && product.description === 'Ready and available. Sold per kilo.'
            && product.images.length === 0
            && product.modifiers.length === 0
        ))).toBe(true);
        expect(pricesByName).toEqual({
            'Pork Belly': 300,
            'Pork Jaw': 200,
            'Side Ribs': 290,
            'Pork Steak': 290,
            'Pork Loin': 250,
            'Ham Leg Boneless & Skinless': 250,
            'Pork Shoulder': 250,
            'Rosary Bones': 160,
            Maskara: 150,
            'Pork Middle': 270,
            'Dressed Chicken': 185,
            'Breast & Thigh Fillet': 280,
            'Leg Meat': 250,
            'Chicken Leg Quarter': 175,
            Wings: 195,
            'Short Plate': 520,
            Forequarter: 500,
            'Beef Shank': 500
        });
    });
});
