/**
 * UOM (Unit of Measure) Converter Utility - Frontend Version
 * 
 * Provides conversion between compatible units of measure for accurate
 * job order calculations and inventory management.
 * 
 * @module utils/uomConverter
 */

// ============================================
// UOM COMPATIBILITY GROUPS & CONVERSION FACTORS
// ============================================

/**
 * UOM Groups with conversion factors to base unit
 * - Weight: base unit is grams (g)
 * - Volume: base unit is milliliters (mL)
 * - Count: base unit is pieces (pcs)
 */
export const UOM_GROUPS = {
    weight: {
        base: 'g',
        label: 'Weight',
        units: {
            mg: { factor: 0.001, label: 'Milligram (mg)' },
            g: { factor: 1, label: 'Gram (g)' },
            kg: { factor: 1000, label: 'Kilogram (kg)' },
            lb: { factor: 453.592, label: 'Pound (lb)' },
            oz: { factor: 28.3495, label: 'Ounce (oz)' }
        }
    },
    volume: {
        base: 'mL',
        label: 'Volume',
        units: {
            mL: { factor: 1, label: 'Milliliter (mL)' },
            L: { factor: 1000, label: 'Liter (L)' },
            gal: { factor: 3785.41, label: 'Gallon (gal)' },
            cup: { factor: 236.588, label: 'Cup' },
            tbsp: { factor: 14.787, label: 'Tablespoon (tbsp)' },
            tsp: { factor: 4.929, label: 'Teaspoon (tsp)' }
        }
    },
    count: {
        base: 'pcs',
        label: 'Count',
        units: {
            pcs: { factor: 1, label: 'Pieces (pcs)' },
            units: { factor: 1, label: 'Units' },
            dozen: { factor: 12, label: 'Dozen' }
        }
    }
};

/**
 * Common aliases for UOM normalization
 */
const UOM_ALIASES = {
    // Weight
    'gram': 'g', 'grams': 'g', 'Gram': 'g', 'Grams': 'g',
    'milligram': 'mg', 'milligrams': 'mg', 'Milligram': 'mg',
    'kilogram': 'kg', 'kilograms': 'kg', 'Kilogram': 'kg', 'Kilograms': 'kg', 'kilo': 'kg', 'Kilo': 'kg',
    'pound': 'lb', 'pounds': 'lb', 'Pound': 'lb', 'Pounds': 'lb', 'lbs': 'lb',
    'ounce': 'oz', 'ounces': 'oz', 'Ounce': 'oz', 'Ounces': 'oz',
    // Volume
    'milliliter': 'mL', 'milliliters': 'mL', 'Milliliter': 'mL', 'ml': 'mL', 'ML': 'mL',
    'liter': 'L', 'liters': 'L', 'Liter': 'L', 'Liters': 'L', 'l': 'L',
    'gallon': 'gal', 'gallons': 'gal', 'Gallon': 'gal',
    'cups': 'cup', 'Cup': 'cup', 'Cups': 'cup',
    'tablespoon': 'tbsp', 'tablespoons': 'tbsp', 'Tablespoon': 'tbsp',
    'teaspoon': 'tsp', 'teaspoons': 'tsp', 'Teaspoon': 'tsp',
    // Count
    'piece': 'pcs', 'pieces': 'pcs', 'Piece': 'pcs', 'Pieces': 'pcs', 'pc': 'pcs',
    'unit': 'units', 'Unit': 'units', 'Units': 'units',
    'doz': 'dozen', 'Dozen': 'dozen', 'Doz': 'dozen'
};

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Normalize a UOM string to its standard abbreviation
 */
export const normalizeUom = (uomString) => {
    if (!uomString) return null;
    const trimmed = uomString.trim();

    for (const group of Object.values(UOM_GROUPS)) {
        if (trimmed in group.units) return trimmed;
    }

    if (trimmed in UOM_ALIASES) return UOM_ALIASES[trimmed];
    return trimmed;
};

/**
 * Get the group name for a UOM
 */
export const getUomGroup = (uom) => {
    const normalized = normalizeUom(uom);
    if (!normalized) return null;

    for (const [groupName, group] of Object.entries(UOM_GROUPS)) {
        if (normalized in group.units) return groupName;
    }
    return null;
};

/**
 * Check if two UOMs are compatible
 */
export const areCompatible = (uom1, uom2) => {
    const group1 = getUomGroup(uom1);
    const group2 = getUomGroup(uom2);
    return group1 !== null && group1 === group2;
};

/**
 * Get the base unit for a UOM's group
 */
export const getBaseUnit = (uom) => {
    const groupName = getUomGroup(uom);
    if (!groupName) return null;
    return UOM_GROUPS[groupName].base;
};

/**
 * Convert a quantity from one UOM to another
 */
export const convertQuantity = (value, fromUom, toUom) => {
    if (value === null || value === undefined) return null;

    const normalizedFrom = normalizeUom(fromUom);
    const normalizedTo = normalizeUom(toUom);

    if (normalizedFrom === normalizedTo) return value;
    if (!areCompatible(normalizedFrom, normalizedTo)) return null;

    const groupName = getUomGroup(normalizedFrom);
    const group = UOM_GROUPS[groupName];

    const fromFactor = group.units[normalizedFrom].factor;
    const toFactor = group.units[normalizedTo].factor;

    const result = value * (fromFactor / toFactor);
    return Math.round(result * 1e12) / 1e12;
};

/**
 * Get all UOM options for dropdown display
 */
export const getAllUomOptions = () => {
    const options = [];

    for (const [groupName, group] of Object.entries(UOM_GROUPS)) {
        for (const [unitKey, unitData] of Object.entries(group.units)) {
            options.push({
                value: unitKey,
                label: unitData.label,
                group: group.label,
                groupKey: groupName
            });
        }
    }

    return options;
};

/**
 * Get UOM options grouped by category
 */
export const getGroupedUomOptions = () => {
    const grouped = {};

    for (const [groupName, group] of Object.entries(UOM_GROUPS)) {
        grouped[group.label] = Object.entries(group.units).map(([unitKey, unitData]) => ({
            value: unitKey,
            label: unitData.label
        }));
    }

    return grouped;
};

/**
 * Get the display label for a UOM
 */
export const getUomLabel = (uom) => {
    const normalized = normalizeUom(uom);
    if (!normalized) return uom || '';

    for (const group of Object.values(UOM_GROUPS)) {
        if (normalized in group.units) {
            return group.units[normalized].label;
        }
    }
    return uom;
};

/**
 * Get the short label for a UOM (just the abbreviation)
 */
export const getUomShortLabel = (uom) => {
    const normalized = normalizeUom(uom);
    return normalized || uom || '';
};

/**
 * Check if a UOM is a known/valid UOM
 */
export const isValidUom = (uom) => {
    return getUomGroup(uom) !== null;
};

/**
 * Convert quantity with detailed result for UI display
 */
export const convertWithDetails = (value, fromUom, toUom) => {
    const normalizedFrom = normalizeUom(fromUom);
    const normalizedTo = normalizeUom(toUom);

    if (normalizedFrom === normalizedTo) {
        return {
            success: true,
            value: value,
            fromUom: normalizedFrom,
            toUom: normalizedTo,
            wasConverted: false,
            displayText: `${value} ${getUomShortLabel(normalizedTo)}`
        };
    }

    if (!areCompatible(normalizedFrom, normalizedTo)) {
        return {
            success: false,
            value: null,
            fromUom: normalizedFrom,
            toUom: normalizedTo,
            wasConverted: false,
            error: `Cannot convert ${getUomLabel(fromUom)} to ${getUomLabel(toUom)}`
        };
    }

    const converted = convertQuantity(value, normalizedFrom, normalizedTo);

    return {
        success: true,
        value: converted,
        fromUom: normalizedFrom,
        toUom: normalizedTo,
        wasConverted: true,
        originalValue: value,
        displayText: `${converted} ${getUomShortLabel(normalizedTo)}`,
        conversionNote: `(from ${value} ${getUomShortLabel(normalizedFrom)})`
    };
};

export default {
    normalizeUom,
    getUomGroup,
    areCompatible,
    getBaseUnit,
    convertQuantity,
    convertWithDetails,
    getAllUomOptions,
    getGroupedUomOptions,
    getUomLabel,
    getUomShortLabel,
    isValidUom,
    UOM_GROUPS
};
