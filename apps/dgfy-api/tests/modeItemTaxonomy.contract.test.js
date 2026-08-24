import {
    CORRECTED_ITEM_TAXONOMY_MODES,
    ITEM_FINANCIAL_REQUIREMENT,
    ITEM_FINANCIAL_VISIBILITY,
    MODE_ITEM_TAXONOMY as backendTaxonomy,
    PLACEHOLDER_ITEM_TAXONOMY_MODES,
    validateItemAgainstModeTaxonomy
} from '../src/modules/shared/constants/modeItemTaxonomy.js';
import {
    allowsDecimalQuantity as backendAllowsDecimalQuantity,
    areCompatible as backendAreCompatible,
    getUomGroup as backendGetUomGroup,
    isValidUom as backendIsValidUom
} from '../src/utils/uomConverter.js';
import { MODE_ITEM_TAXONOMY as frontendTaxonomy } from '../../../packages/web-core/src/features/settings/modeItemTaxonomy.js';
import {
    allowsDecimalQuantity as frontendAllowsDecimalQuantity,
    areCompatible as frontendAreCompatible,
    getUomGroup as frontendGetUomGroup,
    isValidUom as frontendIsValidUom
} from '../../../packages/web-core/src/utils/uomConverter.js';

describe('mode-aware item taxonomy contract', () => {
    it('keeps corrected mode taxonomy aligned across backend and frontend', () => {
        expect(frontendTaxonomy).toEqual(backendTaxonomy);
        expect(Object.keys(backendTaxonomy).sort()).toEqual([
            'fnb',
            'food_manufacturing',
            'hospitality',
            'msme',
            'retail',
            'services'
        ]);
    });

    it('keeps future placeholder modes outside corrected taxonomy until their financial contracts are governed', () => {
        expect([...CORRECTED_ITEM_TAXONOMY_MODES].sort()).toEqual([
            'fnb',
            'food_manufacturing',
            'hospitality',
            'msme',
            'retail',
            'services'
        ]);
        expect([...PLACEHOLDER_ITEM_TAXONOMY_MODES].sort()).toEqual([
            'education_institutions',
            'healthcare',
            'logistics_distribution',
            'ticketing_transport'
        ]);
        expect(CORRECTED_ITEM_TAXONOMY_MODES.filter((mode) => PLACEHOLDER_ITEM_TAXONOMY_MODES.includes(mode))).toEqual([]);
    });

    it('recognizes business presentation units without auto-converting them', () => {
        ['serving', 'service', 'session', 'ticket', 'booking', 'room_night', 'bottle', 'case'].forEach((unit) => {
            expect(backendIsValidUom(unit)).toBe(true);
            expect(frontendIsValidUom(unit)).toBe(true);
            expect(frontendGetUomGroup(unit)).toBe(backendGetUomGroup(unit));
        });

        expect(backendAreCompatible('kg', 'g')).toBe(true);
        expect(frontendAreCompatible('kg', 'g')).toBe(true);
        expect(backendAreCompatible('serving', 'portion')).toBe(false);
        expect(frontendAreCompatible('serving', 'portion')).toBe(false);
        expect(backendAreCompatible('bottle', 'case')).toBe(false);
        expect(frontendAreCompatible('bottle', 'case')).toBe(false);
    });

    it('Phase 6c: allows decimal quantity only for weight/volume UOMs, identically across layers', () => {
        // A weighed_goods/refill_product item sold by weight or volume should
        // accept a fractional POS quantity (0.35 kg); the same presets sold by
        // the piece (both allow a `count` unit too) must not.
        ['kg', 'g', 'mL', 'L', 'gal'].forEach((uom) => {
            expect(backendAllowsDecimalQuantity(uom)).toBe(true);
            expect(frontendAllowsDecimalQuantity(uom)).toBe(true);
        });
        ['pcs', 'serving', 'booking', 'bottle', 'pack', 'dozen'].forEach((uom) => {
            expect(backendAllowsDecimalQuantity(uom)).toBe(false);
            expect(frontendAllowsDecimalQuantity(uom)).toBe(false);
        });
        expect(backendAllowsDecimalQuantity('')).toBe(false);
        expect(backendAllowsDecimalQuantity(null)).toBe(false);
        expect(backendAllowsDecimalQuantity('not-a-real-uom')).toBe(false);
    });

    it('defines mode-specific financial visibility and readiness policy', () => {
        const presetByKey = (mode, key) => backendTaxonomy[mode].presets.find((entry) => entry.key === key);

        expect(presetByKey('services', 'service').financial_profile).toEqual(expect.objectContaining({
            cost_visibility: ITEM_FINANCIAL_VISIBILITY.HIDDEN_OPTIONAL,
            sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE,
            sale_price_required: ITEM_FINANCIAL_REQUIREMENT.WHEN_SELLABLE
        }));
        expect(presetByKey('services', 'physical_add_on').financial_profile).toEqual(expect.objectContaining({
            cost_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE,
            sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.SELLABLE_ONLY
        }));
        expect(presetByKey('food_manufacturing', 'finished_product').financial_profile.sale_price_visibility)
            .toBe(ITEM_FINANCIAL_VISIBILITY.VISIBLE);
        expect(presetByKey('fnb', 'menu_item').financial_profile.sale_price_visibility)
            .toBe(ITEM_FINANCIAL_VISIBILITY.VISIBLE);
        expect(presetByKey('fnb', 'packaged_beverage').financial_profile.sale_price_visibility)
            .toBe(ITEM_FINANCIAL_VISIBILITY.VISIBLE);
        expect(presetByKey('hospitality', 'room_night').financial_profile.sale_price_visibility)
            .toBe(ITEM_FINANCIAL_VISIBILITY.VISIBLE);
        expect(presetByKey('hospitality', 'minibar_retail_product').financial_profile).toEqual(expect.objectContaining({
            cost_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE,
            sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE
        }));
        expect(presetByKey('hospitality', 'housekeeping_supply').financial_profile.sale_price_visibility)
            .toBe(ITEM_FINANCIAL_VISIBILITY.SELLABLE_ONLY);
        expect(presetByKey('food_manufacturing', 'raw_material').financial_profile.sale_price_visibility)
            .toBe(ITEM_FINANCIAL_VISIBILITY.SELLABLE_ONLY);
        expect(presetByKey('msme', 'product').financial_profile).toEqual(expect.objectContaining({
            cost_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE,
            sale_price_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE
        }));
        expect(presetByKey('retail', 'general_merchandise').financial_profile.sale_price_visibility)
            .toBe(ITEM_FINANCIAL_VISIBILITY.VISIBLE);
        expect(presetByKey('retail', 'weighed_goods').financial_profile.sale_price_visibility)
            .toBe(ITEM_FINANCIAL_VISIBILITY.VISIBLE);
        expect(presetByKey('retail', 'refill_product').financial_profile.sale_price_visibility)
            .toBe(ITEM_FINANCIAL_VISIBILITY.VISIBLE);
    });

    it('accepts corrected mode item combinations and rejects mismatched new items', () => {
        expect(validateItemAgainstModeTaxonomy({
            workflowMode: 'fnb',
            itemData: {
                category: 'product',
                product_type: 'finished_goods',
                unit_of_measure: 'serving'
            },
            operation: 'create'
        }).ok).toBe(true);

        expect(validateItemAgainstModeTaxonomy({
            workflowMode: 'services',
            itemData: {
                category: 'service',
                unit_of_measure: 'service'
            },
            operation: 'create'
        }).ok).toBe(true);

        expect(validateItemAgainstModeTaxonomy({
            workflowMode: 'hospitality',
            itemData: {
                category: 'service',
                mode_item_preset: 'room_night',
                unit_of_measure: 'room_night'
            },
            operation: 'create'
        }).preset.key).toBe('room_night');

        expect(validateItemAgainstModeTaxonomy({
            workflowMode: 'hospitality',
            itemData: {
                category: 'product',
                product_type: 'finished_goods',
                mode_item_preset: 'minibar_retail_product',
                unit_of_measure: 'bottle'
            },
            operation: 'create'
        }).preset.key).toBe('minibar_retail_product');

        expect(() => validateItemAgainstModeTaxonomy({
            workflowMode: 'services',
            itemData: {
                category: 'service',
                unit_of_measure: 'kg'
            },
            operation: 'create'
        })).toThrow(/does not support unit_of_measure/i);

        expect(() => validateItemAgainstModeTaxonomy({
            workflowMode: 'hospitality',
            itemData: {
                category: 'service',
                mode_item_preset: 'room_night',
                unit_of_measure: 'kg'
            },
            operation: 'create'
        })).toThrow(/does not support unit_of_measure/i);

        expect(() => validateItemAgainstModeTaxonomy({
            workflowMode: 'fnb',
            itemData: {
                category: 'product',
                product_type: 'finished_goods',
                unit_of_measure: 'ticket'
            },
            operation: 'create'
        })).toThrow(/does not support unit_of_measure/i);

        expect(validateItemAgainstModeTaxonomy({
            workflowMode: 'fnb',
            itemData: {
                category: 'product',
                product_type: 'finished_goods',
                mode_item_preset: 'packaged_beverage',
                unit_of_measure: 'bottle'
            },
            operation: 'create'
        }).preset.key).toBe('packaged_beverage');

        expect(() => validateItemAgainstModeTaxonomy({
            workflowMode: 'fnb',
            itemData: {
                category: 'product',
                product_type: 'finished_goods',
                mode_item_preset: 'menu_item',
                unit_of_measure: 'bottle'
            },
            operation: 'create'
        })).toThrow(/does not support unit_of_measure/i);

        expect(validateItemAgainstModeTaxonomy({
            workflowMode: 'retail',
            itemData: {
                category: 'product',
                product_type: 'finished_goods',
                mode_item_preset: 'weighed_goods',
                unit_of_measure: 'kg'
            },
            operation: 'create'
        }).preset.key).toBe('weighed_goods');

        expect(validateItemAgainstModeTaxonomy({
            workflowMode: 'retail',
            itemData: {
                category: 'product',
                product_type: 'finished_goods',
                unit_of_measure: 'pcs'
            },
            operation: 'create'
        }).preset.key).toBe('general_merchandise');

        expect(() => validateItemAgainstModeTaxonomy({
            workflowMode: 'retail',
            itemData: {
                category: 'product',
                product_type: 'finished_goods',
                mode_item_preset: 'weighed_goods',
                unit_of_measure: 'ticket'
            },
            operation: 'create'
        })).toThrow(/does not support unit_of_measure/i);

        expect(() => validateItemAgainstModeTaxonomy({
            workflowMode: 'retail',
            itemData: {
                category: 'service',
                unit_of_measure: 'service'
            },
            operation: 'create'
        })).toThrow(/does not support category/i);
    });

    it('preserves legacy rows unless category or UOM is changed', () => {
        const result = validateItemAgainstModeTaxonomy({
            workflowMode: 'msme',
            existingItem: {
                status: 'active',
                category: 'raw_material',
                product_type: null,
                unit_of_measure: 'kg'
            },
            itemData: {
                description: 'legacy edit only'
            },
            operation: 'update'
        });

        expect(result).toMatchObject({
            ok: true,
            skipped: 'legacy_edit_without_taxonomy_change'
        });

        expect(() => validateItemAgainstModeTaxonomy({
            workflowMode: 'msme',
            existingItem: {
                status: 'active',
                category: 'raw_material',
                product_type: null,
                unit_of_measure: 'kg'
            },
            itemData: {
                unit_of_measure: 'kg'
            },
            operation: 'update'
        })).toThrow(/does not support category/i);
    });

    describe('Phase 6 composed enabled_capabilities overlay', () => {
        it('still rejects a service item on a retail-mode tenant with no overlay (byte-identical to pre-Phase-6)', () => {
            expect(() => validateItemAgainstModeTaxonomy({
                workflowMode: 'retail',
                itemData: { category: 'service', unit_of_measure: 'service' },
                operation: 'create'
            })).toThrow(/does not support category/i);
        });

        it('unlocks the services taxonomy on a retail-mode tenant that has enabled the services capability', () => {
            const result = validateItemAgainstModeTaxonomy({
                workflowMode: 'retail',
                enabledCapabilities: ['services'],
                itemData: { category: 'service', unit_of_measure: 'service' },
                operation: 'create'
            });
            expect(result.ok).toBe(true);
            expect(result.preset.key).toBe('service');
            expect(result.taxonomy).toBe('retail');
        });

        it('still accepts the retail-mode tenant own presets once services is overlaid (union, not replacement)', () => {
            expect(validateItemAgainstModeTaxonomy({
                workflowMode: 'retail',
                enabledCapabilities: ['services'],
                itemData: {
                    category: 'product',
                    product_type: 'finished_goods',
                    mode_item_preset: 'weighed_goods',
                    unit_of_measure: 'kg'
                },
                operation: 'create'
            }).preset.key).toBe('weighed_goods');
        });

        it('ignores an overlay capability that has no mapped taxonomy mode', () => {
            // Neither `inventory` nor `menuModifiers` is in CAPABILITY_TAXONOMY_OVERLAY_MODES,
            // so this must still throw exactly like the no-overlay case.
            expect(() => validateItemAgainstModeTaxonomy({
                workflowMode: 'retail',
                enabledCapabilities: ['inventory', 'menuModifiers'],
                itemData: { category: 'service', unit_of_measure: 'service' },
                operation: 'create'
            })).toThrow(/does not support category/i);
        });

        it('unlocks fnb presets via fnbDining and hospitality presets via hospitalityReservations', () => {
            expect(validateItemAgainstModeTaxonomy({
                workflowMode: 'retail',
                enabledCapabilities: ['fnbDining'],
                itemData: {
                    category: 'product',
                    product_type: 'finished_goods',
                    mode_item_preset: 'menu_item',
                    unit_of_measure: 'serving'
                },
                operation: 'create'
            }).preset.key).toBe('menu_item');

            expect(validateItemAgainstModeTaxonomy({
                workflowMode: 'retail',
                enabledCapabilities: ['hospitalityReservations'],
                itemData: {
                    category: 'service',
                    mode_item_preset: 'room_night',
                    unit_of_measure: 'room_night'
                },
                operation: 'create'
            }).preset.key).toBe('room_night');
        });

        it('lets the base mode preset win when the overlay mode defines a colliding preset key', () => {
            // 'supplies' exists as a preset key in both retail and services taxonomies.
            // The base (retail) definition must be the one actually applied.
            const result = validateItemAgainstModeTaxonomy({
                workflowMode: 'retail',
                enabledCapabilities: ['services'],
                itemData: { category: 'supplies', unit_of_measure: 'pcs' },
                operation: 'create'
            });
            expect(result.preset.key).toBe('supplies');
            expect(result.taxonomy).toBe('retail');
        });
    });

    describe('Phase 16/21 subtractive disabled_capabilities overlay', () => {
        it('rejects a service item on a retail tenant that enabled services and then disabled it again', () => {
            // Before Phase 21, validateItemAgainstModeTaxonomy only ever saw
            // the raw enabled overlay, so a capability that was additively
            // enabled and later subtracted still granted its item-taxonomy
            // presets forever.
            expect(() => validateItemAgainstModeTaxonomy({
                workflowMode: 'retail',
                enabledCapabilities: ['services'],
                disabledCapabilities: ['services'],
                itemData: { category: 'service', unit_of_measure: 'service' },
                operation: 'create'
            })).toThrow(/does not support category/i);
        });

        it('still unlocks the services taxonomy when a different capability is disabled', () => {
            const result = validateItemAgainstModeTaxonomy({
                workflowMode: 'retail',
                enabledCapabilities: ['services'],
                disabledCapabilities: ['inventory'],
                itemData: { category: 'service', unit_of_measure: 'service' },
                operation: 'create'
            });
            expect(result.ok).toBe(true);
            expect(result.preset.key).toBe('service');
        });

        it('does not let disabling a base-mode capability change the base taxonomy (base list stays the taxonomy oracle)', () => {
            // 'catalog' is a base retail capability, not a taxonomy-overlay
            // key - disabling it must not affect item taxonomy resolution.
            const result = validateItemAgainstModeTaxonomy({
                workflowMode: 'retail',
                disabledCapabilities: ['catalog'],
                itemData: {
                    category: 'product',
                    product_type: 'finished_goods',
                    mode_item_preset: 'weighed_goods',
                    unit_of_measure: 'kg'
                },
                operation: 'create'
            });
            expect(result.ok).toBe(true);
            expect(result.taxonomy).toBe('retail');
        });
    });
});
