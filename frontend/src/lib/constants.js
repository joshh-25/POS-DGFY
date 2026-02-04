/**
 * Standardized Unit of Measure Options
 * 
 * These are organized by category (Weight, Volume, Count) and used
 * for the UOM dropdown in item creation/editing forms.
 * 
 * For conversion logic, see: utils/uomConverter.js
 */
export const ITEM_UNITS = [
    // Weight Group
    { value: 'mg', label: 'Milligram (mg)', group: 'Weight' },
    { value: 'g', label: 'Gram (g)', group: 'Weight' },
    { value: 'kg', label: 'Kilogram (kg)', group: 'Weight' },
    { value: 'lb', label: 'Pound (lb)', group: 'Weight' },
    { value: 'oz', label: 'Ounce (oz)', group: 'Weight' },
    // Volume Group
    { value: 'mL', label: 'Milliliter (mL)', group: 'Volume' },
    { value: 'L', label: 'Liter (L)', group: 'Volume' },
    { value: 'gal', label: 'Gallon (gal)', group: 'Volume' },
    { value: 'cup', label: 'Cup', group: 'Volume' },
    { value: 'tbsp', label: 'Tablespoon (tbsp)', group: 'Volume' },
    { value: 'tsp', label: 'Teaspoon (tsp)', group: 'Volume' },
    // Count Group
    { value: 'pcs', label: 'Pieces (pcs)', group: 'Count' },
    { value: 'units', label: 'Units', group: 'Count' },
    { value: 'dozen', label: 'Dozen', group: 'Count' },
];

/**
 * Legacy UOM aliases for backward compatibility
 * Maps old values to new standardized values
 */
export const UOM_LEGACY_MAP = {
    'lbs': 'lb',
    'ml': 'mL',
    'liters': 'L',
    'grams': 'g',
    'kilograms': 'kg',
    'kilogram': 'kg',
    'gram': 'g',
    'pieces': 'pcs',
    'piece': 'pcs',
};
