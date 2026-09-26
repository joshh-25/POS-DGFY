import { describe, expect, it } from 'vitest';
import {
    buildResumedCartLines,
    formatParkedSaleDisplayName,
    getParkedSaleCatalogLookupQueries,
    mergeParkedSaleCatalogResults,
    validateParkedSaleResume
} from '../posParkedSaleResume.js';

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
                vat_type: 'vatable',
                parked_snapshot_line: true,
                parked_original_quantity: 2,
                parked_line_can_increase: true,
                parked_line_price_changed: false,
                parked_line_item_missing: false
            })
        ]));
    });

    it('marks a resumed line as locked for quantity additions after price drift', () => {
        const lines = buildResumedCartLines({
            parkedSale,
            catalog: [{ ...catalog[0], default_sale_price: 150 }]
        });

        expect(lines[0]).toEqual(expect.objectContaining({
            parked_snapshot_line: true,
            parked_original_quantity: 2,
            parked_line_price_changed: true,
            parked_line_can_increase: false,
            parked_line_item_missing: false
        }));
    });

    it('marks a resumed line as unavailable when the catalog item is missing', () => {
        const lines = buildResumedCartLines({ parkedSale, catalog: [] });

        expect(lines[0]).toEqual(expect.objectContaining({
            parked_snapshot_line: true,
            parked_original_quantity: 2,
            parked_line_item_missing: true,
            parked_line_can_increase: false
        }));
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

    it('identifies every parked item for an authoritative catalog refresh', () => {
        const queries = getParkedSaleCatalogLookupQueries({
            parkedSale: {
                ...parkedSale,
                snapshot: {
                    ...parkedSale.snapshot,
                    lines: [
                        parkedSale.snapshot.lines[0],
                        { item_id: 8, item_name: 'Tapsilog', sku_code: 'TAP-01', quantity: 1 }
                    ]
                }
            },
            catalog
        });

        expect(queries).toEqual(['Coffee', 'TAP-01']);
    });

    it('merges searched catalog results so a parked item outside the presentation catalog can resume', () => {
        const searchedItem = {
            item_id: 8,
            name: 'Tapsilog',
            sku_code: 'TAP-01',
            default_sale_price: 159,
            current_stock: 4
        };
        const parkedWithSearchedItem = {
            ...parkedSale,
            snapshot: {
                ...parkedSale.snapshot,
                lines: [{
                    item_id: 8,
                    item_name: 'Tapsilog',
                    sku_code: 'TAP-01',
                    quantity: 1,
                    base_sale_price: 159,
                    sale_price: 159
                }]
            }
        };
        const mergedCatalog = mergeParkedSaleCatalogResults(catalog, [[searchedItem]], parkedWithSearchedItem);

        expect(validateParkedSaleResume({
            parkedSale: parkedWithSearchedItem,
            catalog: mergedCatalog,
            allowedOrderMethods: ['takeout']
        })).toEqual(expect.objectContaining({ ok: true, conflicts: [] }));
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

    it('downgrades price, stock, and missing-catalog drift to payable snapshot warnings', () => {
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
            allowedOrderMethods: ['takeout'],
            historicalSnapshotPolicy: 'warn'
        });

        expect(validation.ok).toBe(true);
        expect(validation.conflicts).toEqual([]);
        expect(validation.warnings.join(' ')).toContain('Coffee no longer has enough stock');
        expect(validation.warnings.join(' ')).toContain('saved price will be honored');
        expect(validation.warnings.join(' ')).toContain('Removed item is no longer available');
    });

    it('downgrades an invalid current catalog price to a payable snapshot warning', () => {
        const validation = validateParkedSaleResume({
            parkedSale,
            catalog: [{ ...catalog[0], default_sale_price: null }],
            allowedOrderMethods: ['takeout'],
            historicalSnapshotPolicy: 'warn'
        });

        expect(validation.ok).toBe(true);
        expect(validation.conflicts).toEqual([]);
        expect(validation.warnings.join(' ')).toContain('parked snapshot price will be honored');
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

    it('recognizes a migrated legacy profile and requires the cashier to reselect the approved rule', () => {
        const validation = validateParkedSaleResume({
            parkedSale: {
                ...parkedSale,
                snapshot: {
                    ...parkedSale.snapshot,
                    discount_context: {
                        selected_profile: {
                            name: 'PWD',
                            percentage: 15
                        }
                    }
                }
            },
            catalog,
            allowedOrderMethods: ['takeout'],
            discountRules: [{
                discount_rule_id: 31,
                discount_key: 'custom:31',
                name: 'PWD',
                type: 'custom',
                method: 'percentage',
                percentage: 15,
                is_enabled: true,
                is_approved: true
            }]
        });

        expect(validation.ok).toBe(true);
        expect(validation.warnings.join(' ')).toContain('was migrated');
        expect(validation.warnings.join(' ')).toContain('reselect the current approved rule');
    });

    it('blocks an applied discount when its current configurable rule is missing or changed', () => {
        const validation = validateParkedSaleResume({
            parkedSale: {
                ...parkedSale,
                snapshot: {
                    ...parkedSale.snapshot,
                    discount_context: {
                        applied: {
                            type: 'custom',
                            rule_id: 41,
                            discount_key: 'custom:41',
                            label: 'Employee Discount',
                            method: 'percentage',
                            rate: 12,
                            amount: 15
                        }
                    }
                }
            },
            catalog,
            allowedOrderMethods: ['takeout'],
            discountRules: [{
                discount_rule_id: 41,
                discount_key: 'custom:41',
                name: 'Employee Discount',
                type: 'custom',
                method: 'percentage',
                percentage: 10,
                is_enabled: true,
                is_approved: true
            }],
            historicalSnapshotPolicy: 'warn'
        });

        expect(validation.ok).toBe(false);
        expect(validation.conflicts.join(' ')).toContain('changed after this sale was parked');
    });
});
