import { describe, expect, it } from 'vitest';
import { buildResumedCartLines, formatParkedSaleDisplayName, validateParkedSaleResume } from '../posParkedSaleResume.js';

const catalog = [{
    item_id: 7,
    name: 'Coffee',
    category: 'Beverage',
    default_sale_price: 125,
    current_stock: 8,
    vat_type: 'vatable',
    unit_of_measure: 'piece'
}];

const parkedSale = {
    pos_parked_sale_id: 17,
    park_reference: 'PARK-ABC123',
    status: 'parked',
    snapshot: {
        parked_sale_name: 'Maria Santos',
        order_method: 'takeout',
        lines: [{
            line_key: 'line-7-1',
            item_id: 7,
            item_name: 'Coffee',
            quantity: 2,
            base_sale_price: 125,
            sale_price: 125,
            line_modifiers: []
        }]
    }
};

describe('POS parked-sale resume validation', () => {
    it('shows the customer or order name with the short ID without changing the stored reference', () => {
        expect(formatParkedSaleDisplayName(parkedSale)).toBe('Maria Santos · Parked Sale #17');
        expect(parkedSale.park_reference).toBe('PARK-ABC123');
        expect(formatParkedSaleDisplayName({ pos_parked_sale_id: 18, snapshot: {} })).toBe('Parked Sale #18');
        expect(formatParkedSaleDisplayName({})).toBe('Parked Sale');
    });

    it('accepts a current catalog match and rebuilds cart metadata from the catalog', () => {
        const validation = validateParkedSaleResume({
            parkedSale,
            catalog,
            allowedOrderMethods: ['takeout', 'dine_in']
        });
        const lines = buildResumedCartLines({ parkedSale, catalog });

        expect(validation.ok).toBe(true);
        expect(lines).toEqual(expect.arrayContaining([
            expect.objectContaining({
                line_key: 'line-7-1',
                item_id: 7,
                item_name: 'Coffee',
                quantity: 2,
                sale_price: 125,
                vat_type: 'vatable'
            })
        ]));
    });

    it('allows an Always Available item to resume with zero stock', () => {
        const validation = validateParkedSaleResume({
            parkedSale,
            catalog: [{
                ...catalog[0],
                current_stock: 0,
                pos_always_available: true
            }],
            allowedOrderMethods: ['takeout']
        });

        expect(validation.ok).toBe(true);
        expect(validation.conflicts).toEqual([]);
    });

    it('resolves a legacy parked line by a unique current item name and rebuilds its current ID', () => {
        const legacyParkedSale = {
            ...parkedSale,
            snapshot: {
                ...parkedSale.snapshot,
                lines: [{
                    ...parkedSale.snapshot.lines[0],
                    item_id: 999,
                    item_name: 'Sliced Cheese',
                    base_sale_price: 20,
                    sale_price: 20
                }]
            }
        };
        const currentCatalog = [{
            item_id: 42,
            name: 'Sliced Cheese',
            sku_code: 'CHEESE-01',
            category: 'Add Ons',
            default_sale_price: 20,
            current_stock: 0,
            pos_always_available: true,
            vat_type: 'vatable'
        }];

        const validation = validateParkedSaleResume({
            parkedSale: legacyParkedSale,
            catalog: currentCatalog,
            allowedOrderMethods: ['takeout']
        });
        const lines = buildResumedCartLines({ parkedSale: legacyParkedSale, catalog: currentCatalog });

        expect(validation.ok).toBe(true);
        expect(lines[0]).toEqual(expect.objectContaining({
            item_id: 42,
            item_name: 'Sliced Cheese',
            sku_code: 'CHEESE-01'
        }));
    });

    it('blocks an ambiguous legacy name instead of selecting the wrong item', () => {
        const validation = validateParkedSaleResume({
            parkedSale: {
                ...parkedSale,
                snapshot: {
                    ...parkedSale.snapshot,
                    lines: [{ ...parkedSale.snapshot.lines[0], item_id: 999, item_name: 'Sliced Cheese' }]
                }
            },
            catalog: [
                { item_id: 42, name: 'Sliced Cheese', default_sale_price: 125, current_stock: 0, pos_always_available: true },
                { item_id: 43, name: 'Sliced Cheese', default_sale_price: 125, current_stock: 0, pos_always_available: true }
            ],
            allowedOrderMethods: ['takeout']
        });

        expect(validation.ok).toBe(false);
        expect(validation.conflicts.join(' ')).toContain('matches multiple current POS catalog items');
    });

    it('blocks stale price, stock, and missing-catalog conflicts before claim', () => {
        const validation = validateParkedSaleResume({
            parkedSale: {
                ...parkedSale,
                snapshot: {
                    ...parkedSale.snapshot,
                    lines: [{
                        ...parkedSale.snapshot.lines[0],
                        quantity: 10,
                        base_sale_price: 100,
                        sale_price: 100
                    }, {
                        item_id: 999,
                        item_name: 'Removed item',
                        quantity: 1,
                        sale_price: 10,
                        base_sale_price: 10
                    }]
                }
            },
            catalog,
            allowedOrderMethods: ['takeout']
        });

        expect(validation.ok).toBe(false);
        expect(validation.conflicts.join(' ')).toContain('Coffee no longer has enough stock');
        expect(validation.conflicts.join(' ')).toContain('selling price changed');
        expect(validation.conflicts.join(' ')).toContain('Removed item is no longer available');
    });

    it('blocks a parked order method that the active workflow no longer allows', () => {
        const validation = validateParkedSaleResume({
            parkedSale,
            catalog,
            allowedOrderMethods: ['dine_in']
        });

        expect(validation.ok).toBe(false);
        expect(validation.conflicts[0]).toContain('Order method "takeout" is no longer available');
    });
});
