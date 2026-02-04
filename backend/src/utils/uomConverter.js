/**
 * UOM (Unit of Measure) Converter Utility
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
const UOM_GROUPS = {
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
 * Maps variant spellings/formats to standard values
 */
const UOM_ALIASES = {
    // Weight aliases
    'gram': 'g',
    'grams': 'g',
    'Gram': 'g',
    'Grams': 'g',
    'milligram': 'mg',
    'milligrams': 'mg',
    'Milligram': 'mg',
    'kilogram': 'kg',
    'kilograms': 'kg',
    'Kilogram': 'kg',
    'Kilograms': 'kg',
    'kilo': 'kg',
    'Kilo': 'kg',
    'pound': 'lb',
    'pounds': 'lb',
    'Pound': 'lb',
    'Pounds': 'lb',
    'lbs': 'lb',
    'ounce': 'oz',
    'ounces': 'oz',
    'Ounce': 'oz',
    'Ounces': 'oz',

    // Volume aliases
    'milliliter': 'mL',
    'milliliters': 'mL',
    'Milliliter': 'mL',
    'ml': 'mL',
    'ML': 'mL',
    'liter': 'L',
    'liters': 'L',
    'Liter': 'L',
    'Liters': 'L',
    'l': 'L',
    'gallon': 'gal',
    'gallons': 'gal',
    'Gallon': 'gal',
    'cups': 'cup',
    'Cup': 'cup',
    'Cups': 'cup',
    'tablespoon': 'tbsp',
    'tablespoons': 'tbsp',
    'Tablespoon': 'tbsp',
    'teaspoon': 'tsp',
    'teaspoons': 'tsp',
    'Teaspoon': 'tsp',

    // Count aliases
    'piece': 'pcs',
    'pieces': 'pcs',
    'Piece': 'pcs',
    'Pieces': 'pcs',
    'pc': 'pcs',
    'unit': 'units',
    'Unit': 'units',
    'Units': 'units',
    'doz': 'dozen',
    'Dozen': 'dozen',
    'Doz': 'dozen'
};

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Normalize a UOM string to its standard abbreviation
 * @param {string} uomString - The UOM to normalize (e.g., 'Kilogram', 'kg', 'kilo')
 * @returns {string} Normalized UOM abbreviation (e.g., 'kg')
 */
export const normalizeUom = (uomString) => {
    if (!uomString) return null;

    const trimmed = uomString.trim();

    // Check if it's already a standard UOM
    for (const group of Object.values(UOM_GROUPS)) {
        if (trimmed in group.units) {
            return trimmed;
        }
    }

    // Check aliases
    if (trimmed in UOM_ALIASES) {
        return UOM_ALIASES[trimmed];
    }

    // Return original if not found (for unknown UOMs)
    return trimmed;
};

/**
 * Get the group name for a UOM
 * @param {string} uom - The UOM to check
 * @returns {string|null} Group name ('weight', 'volume', 'count') or null if not found
 */
export const getUomGroup = (uom) => {
    const normalized = normalizeUom(uom);
    if (!normalized) return null;

    for (const [groupName, group] of Object.entries(UOM_GROUPS)) {
        if (normalized in group.units) {
            return groupName;
        }
    }

    return null;
};

/**
 * Check if two UOMs are compatible (can be converted between each other)
 * @param {string} uom1 - First UOM
 * @param {string} uom2 - Second UOM
 * @returns {boolean} True if compatible, false otherwise
 */
export const areCompatible = (uom1, uom2) => {
    const group1 = getUomGroup(uom1);
    const group2 = getUomGroup(uom2);

    // Both must be in a known group and in the same group
    return group1 !== null && group1 === group2;
};

/**
 * Get the base unit for a UOM's group
 * @param {string} uom - The UOM to check
 * @returns {string|null} Base unit (e.g., 'g' for weight) or null if not found
 */
export const getBaseUnit = (uom) => {
    const groupName = getUomGroup(uom);
    if (!groupName) return null;

    return UOM_GROUPS[groupName].base;
};

/**
 * Convert a quantity from one UOM to another
 * @param {number} value - The quantity to convert
 * @param {string} fromUom - Source UOM
 * @param {string} toUom - Target UOM
 * @returns {number|null} Converted value, or null if incompatible UOMs
 */
export const convertQuantity = (value, fromUom, toUom) => {
    if (value === null || value === undefined) return null;

    const normalizedFrom = normalizeUom(fromUom);
    const normalizedTo = normalizeUom(toUom);

    // Same UOM, no conversion needed
    if (normalizedFrom === normalizedTo) {
        return value;
    }

    // Check compatibility
    if (!areCompatible(normalizedFrom, normalizedTo)) {
        return null; // Incompatible UOMs
    }

    const groupName = getUomGroup(normalizedFrom);
    const group = UOM_GROUPS[groupName];

    const fromFactor = group.units[normalizedFrom].factor;
    const toFactor = group.units[normalizedTo].factor;

    // Convert: value in fromUom -> base unit -> toUom
    // Formula: result = value * (fromFactor / toFactor)
    const result = value * (fromFactor / toFactor);

    // Round to avoid floating point precision issues (12 decimal places)
    return Math.round(result * 1e12) / 1e12;
};

/**
 * Get all UOM options for dropdown display
 * @returns {Array} Array of { value, label, group } for each UOM option
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
 * @returns {Object} Object with group names as keys and arrays of options as values
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
 * @param {string} uom - The UOM abbreviation
 * @returns {string} Display label or the original value if not found
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
 * Check if a UOM is a known/valid UOM
 * @param {string} uom - The UOM to check
 * @returns {boolean} True if known, false otherwise
 */
export const isValidUom = (uom) => {
    return getUomGroup(uom) !== null;
};

/**
 * Convert quantity and return detailed result
 * Useful for showing conversion info in UI
 * @param {number} value - The quantity to convert
 * @param {string} fromUom - Source UOM
 * @param {string} toUom - Target UOM
 * @returns {Object} { success, value, fromUom, toUom, wasConverted, error }
 */
export const convertWithDetails = (value, fromUom, toUom) => {
    const normalizedFrom = normalizeUom(fromUom);
    const normalizedTo = normalizeUom(toUom);

    // Same UOM
    if (normalizedFrom === normalizedTo) {
        return {
            success: true,
            value: value,
            fromUom: normalizedFrom,
            toUom: normalizedTo,
            wasConverted: false,
            displayText: `${value} ${getUomLabel(normalizedTo)}`
        };
    }

    // Check compatibility
    if (!areCompatible(normalizedFrom, normalizedTo)) {
        return {
            success: false,
            value: null,
            fromUom: normalizedFrom,
            toUom: normalizedTo,
            wasConverted: false,
            error: `Cannot convert ${getUomLabel(fromUom)} to ${getUomLabel(toUom)} (incompatible units)`
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
        displayText: `${converted} ${getUomLabel(normalizedTo)}`,
        conversionNote: `(from ${value} ${getUomLabel(normalizedFrom)})`
    };
};

// Export UOM_GROUPS for reference
export { UOM_GROUPS };

// Default export for convenience
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
    isValidUom,
    UOM_GROUPS
};
