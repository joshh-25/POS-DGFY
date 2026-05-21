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
 * UOM groups. Only groups marked convertible can be automatically converted.
 * - Weight: base unit is grams (g)
 * - Volume: base unit is milliliters (mL)
 * - Count: base unit is pieces (pcs)
 * - Packaging, presentation, and time are valid business units but require
 *   item-specific conversion before inventory math can convert them.
 */
export const UOM_GROUPS = {
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
    'doz': 'dozen', 'Dozen': 'dozen', 'Doz': 'dozen',
    // Packaging
    'packs': 'pack', 'Pack': 'pack', 'Packs': 'pack',
    'cases': 'case', 'Case': 'case', 'Cases': 'case',
    'cartons': 'carton', 'Carton': 'carton', 'Cartons': 'carton',
    'boxes': 'box', 'Box': 'box', 'Boxes': 'box',
    'trays': 'tray', 'Tray': 'tray', 'Trays': 'tray',
    'sacks': 'sack', 'Sack': 'sack', 'Sacks': 'sack',
    'bottles': 'bottle', 'Bottle': 'bottle', 'Bottles': 'bottle',
    'cans': 'can', 'Can': 'can', 'Cans': 'can',
    'pouches': 'pouch', 'Pouch': 'pouch', 'Pouches': 'pouch',
    'bags': 'bag', 'Bag': 'bag', 'Bags': 'bag',
    // Presentation/time
    'servings': 'serving', 'Serving': 'serving', 'Servings': 'serving',
    'portions': 'portion', 'Portion': 'portion', 'Portions': 'portion',
    'services': 'service', 'Service': 'service', 'Services': 'service',
    'sessions': 'session', 'Session': 'session', 'Sessions': 'session',
    'bookings': 'booking', 'Booking': 'booking', 'Bookings': 'booking',
    'tickets': 'ticket', 'Ticket': 'ticket', 'Tickets': 'ticket',
    'room night': 'room_night', 'room nights': 'room_night', 'Room night': 'room_night',
    'minutes': 'minute', 'Minute': 'minute', 'Minutes': 'minute', 'min': 'minute',
    'hours': 'hour', 'Hour': 'hour', 'Hours': 'hour', 'hr': 'hour',
    'days': 'day', 'Day': 'day', 'Days': 'day'
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
    return group1 !== null
        && group1 === group2
        && UOM_GROUPS[group1]?.convertible === true;
};

/**
 * Get the base unit for a UOM's group
 */
export const getBaseUnit = (uom) => {
    const groupName = getUomGroup(uom);
    if (!groupName) return null;
    if (UOM_GROUPS[groupName].convertible !== true) return null;
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
    if (!group?.convertible) return null;

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
    filterUomOptions,
    getGroupedUomOptions,
    groupUomOptions,
    getUomLabel,
    getUomShortLabel,
    isValidUom,
    UOM_GROUPS
};
