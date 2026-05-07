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
 * UOM groups. Only groups marked convertible can be automatically converted.
 * - Weight: base unit is grams (g)
 * - Volume: base unit is milliliters (mL)
 * - Count: base unit is pieces (pcs)
 * - Packaging, presentation, and time are valid business units but require
 *   item-specific conversion before inventory math can convert them.
 */
const UOM_GROUPS = {
    weight: {
        base: 'g',
        label: 'Weight',
        convertible: true,
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
        convertible: true,
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
        convertible: true,
        units: {
            pcs: { factor: 1, label: 'Pieces (pcs)' },
            units: { factor: 1, label: 'Units' },
            dozen: { factor: 12, label: 'Dozen' }
        }
    },
    packaging: {
        base: null,
        label: 'Packaging',
        convertible: false,
        units: {
            pack: { label: 'Pack' },
            case: { label: 'Case' },
            carton: { label: 'Carton' },
            box: { label: 'Box' },
            tray: { label: 'Tray' },
            sack: { label: 'Sack' },
            bottle: { label: 'Bottle' },
            can: { label: 'Can' },
            pouch: { label: 'Pouch' },
            bag: { label: 'Bag' }
        }
    },
    presentation: {
        base: null,
        label: 'Presentation',
        convertible: false,
        units: {
            serving: { label: 'Serving' },
            portion: { label: 'Portion' },
            service: { label: 'Service' },
            session: { label: 'Session' },
            booking: { label: 'Booking' },
            ticket: { label: 'Ticket' },
            room_night: { label: 'Room night' }
        }
    },
    time: {
        base: null,
        label: 'Time',
        convertible: false,
        units: {
            minute: { label: 'Minute' },
            hour: { label: 'Hour' },
            day: { label: 'Day' }
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
    'Doz': 'dozen',

    // Packaging aliases
    'packs': 'pack',
    'Pack': 'pack',
    'Packs': 'pack',
    'cases': 'case',
    'Case': 'case',
    'Cases': 'case',
    'cartons': 'carton',
    'Carton': 'carton',
    'Cartons': 'carton',
    'boxes': 'box',
    'Box': 'box',
    'Boxes': 'box',
    'trays': 'tray',
    'Tray': 'tray',
    'Trays': 'tray',
    'sacks': 'sack',
    'Sack': 'sack',
    'Sacks': 'sack',
    'bottles': 'bottle',
    'Bottle': 'bottle',
    'Bottles': 'bottle',
    'cans': 'can',
    'Can': 'can',
    'Cans': 'can',
    'pouches': 'pouch',
    'Pouch': 'pouch',
    'Pouches': 'pouch',
    'bags': 'bag',
    'Bag': 'bag',
    'Bags': 'bag',

    // Presentation and time aliases
    'servings': 'serving',
    'Serving': 'serving',
    'Servings': 'serving',
    'portions': 'portion',
    'Portion': 'portion',
    'Portions': 'portion',
    'services': 'service',
    'Service': 'service',
    'Services': 'service',
    'sessions': 'session',
    'Session': 'session',
    'Sessions': 'session',
    'bookings': 'booking',
    'Booking': 'booking',
    'Bookings': 'booking',
    'tickets': 'ticket',
    'Ticket': 'ticket',
    'Tickets': 'ticket',
    'room night': 'room_night',
    'room nights': 'room_night',
    'Room night': 'room_night',
    'minutes': 'minute',
    'Minute': 'minute',
    'Minutes': 'minute',
    'min': 'minute',
    'hours': 'hour',
    'Hour': 'hour',
    'Hours': 'hour',
    'hr': 'hour',
    'days': 'day',
    'Day': 'day',
    'Days': 'day'
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

    return group1 !== null
        && group1 === group2
        && UOM_GROUPS[group1]?.convertible === true;
};

/**
 * Get the base unit for a UOM's group
 * @param {string} uom - The UOM to check
 * @returns {string|null} Base unit (e.g., 'g' for weight) or null if not found
 */
export const getBaseUnit = (uom) => {
    const groupName = getUomGroup(uom);
    if (!groupName) return null;
    if (UOM_GROUPS[groupName].convertible !== true) return null;

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
    if (!group?.convertible) return null;

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

export const filterUomOptions = ({ allowedGroups = [], allowedUnits = [] } = {}) => {
    const groupSet = new Set((allowedGroups || []).filter(Boolean));
    const unitSet = new Set((allowedUnits || []).map((unit) => normalizeUom(unit)).filter(Boolean));
    if (unitSet.size > 0) {
        return getAllUomOptions().filter((option) => unitSet.has(option.value));
    }
    return getAllUomOptions().filter((option) => (
        groupSet.size === 0
        || groupSet.has(option.groupKey)
    ));
};

/**
 * Get UOM options grouped by category
 * @returns {Object} Object with group names as keys and arrays of options as values
 */
export const getGroupedUomOptions = () => {
    const grouped = {};

    for (const [, group] of Object.entries(UOM_GROUPS)) {
        grouped[group.label] = Object.entries(group.units).map(([unitKey, unitData]) => ({
            value: unitKey,
            label: unitData.label
        }));
    }

    return grouped;
};

export const groupUomOptions = (options = []) => (
    options.reduce((grouped, option) => {
        if (!grouped[option.group]) grouped[option.group] = [];
        grouped[option.group].push({
            value: option.value,
            label: option.label
        });
        return grouped;
    }, {})
);

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
    filterUomOptions,
    getGroupedUomOptions,
    groupUomOptions,
    getUomLabel,
    isValidUom,
    UOM_GROUPS
};
