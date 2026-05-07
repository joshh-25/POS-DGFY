import {
    ITEM_FINANCIAL_REQUIREMENT,
    ITEM_FINANCIAL_VISIBILITY,
    MODE_ITEM_TAXONOMY as backendTaxonomy,
    validateItemAgainstModeTaxonomy
} from '../src/modules/shared/constants/modeItemTaxonomy.js';
import {
    areCompatible as backendAreCompatible,
    getUomGroup as backendGetUomGroup,
    isValidUom as backendIsValidUom
} from '../src/utils/uomConverter.js';
import { MODE_ITEM_TAXONOMY as frontendTaxonomy } from '../../frontend/src/features/settings/modeItemTaxonomy.js';
import {
    areCompatible as frontendAreCompatible,
    getUomGroup as frontendGetUomGroup,
    isValidUom as frontendIsValidUom
} from '../../frontend/src/utils/uomConverter.js';

describe('mode-aware item taxonomy contract', () => {
    it('keeps corrected mode taxonomy aligned across backend and frontend', () => {
        expect(frontendTaxonomy).toEqual(backendTaxonomy);
        expect(Object.keys(backendTaxonomy).sort()).toEqual([
            'fnb',
            'food_manufacturing',
            'msme',
            'services'
        ]);
    });

    it('recognizes business presentation units without auto-converting them', () => {
        ['serving', 'service', 'session', 'ticket', 'booking', 'bottle', 'case'].forEach((unit) => {
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
        expect(presetByKey('food_manufacturing', 'raw_material').financial_profile.sale_price_visibility)
            .toBe(ITEM_FINANCIAL_VISIBILITY.SELLABLE_ONLY);
        expect(presetByKey('msme', 'product').financial_profile).toEqual(expect.objectContaining({
            cost_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE,
            sale_price_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE
        }));
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

        expect(() => validateItemAgainstModeTaxonomy({
            workflowMode: 'services',
            itemData: {
                category: 'service',
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
});
