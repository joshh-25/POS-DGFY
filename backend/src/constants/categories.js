/**
 * Category Constants - Single Source of Truth
 * 
 * Database uses 4 category values + product_type field for products
 * Frontend displays 5 effective categories by combining these fields
 */

// Database category values (snake_case)
export const CATEGORIES = {
    RAW_MATERIAL: 'raw_material',
    PACKAGING: 'packaging',
    PRODUCT: 'product',
    SUPPLIES: 'supplies'
};

// Product type values (only for category='product')
export const PRODUCT_TYPES = {
    WORK_IN_PROGRESS: 'work_in_progress',
    FINISHED_GOODS: 'finished_goods'
};

// All valid category values for validation
export const VALID_CATEGORIES = Object.values(CATEGORIES);

// All valid product_type values for validation
export const VALID_PRODUCT_TYPES = Object.values(PRODUCT_TYPES);

// Helper: Check if category is manufactured (requires product_type)
export const isManufacturedCategory = (category) => {
    return category === CATEGORIES.PRODUCT;
};

// Helper: Check if category is purchasable (can appear in POs)
export const isPurchasableCategory = (category) => {
    return [
        CATEGORIES.RAW_MATERIAL,
        CATEGORIES.PACKAGING,
        CATEGORIES.SUPPLIES
    ].includes(category);
};

// Helper: Check if category can be in supplier items
export const canBeSupplierItem = (category) => {
    return isPurchasableCategory(category);
};

// Helper: Check if can be used as JO input ingredient
export const canBeJobOrderInput = (category, productType) => {
    if (category === CATEGORIES.PRODUCT) {
        // Both WIP and Finished Goods can be JO inputs
        return true;
    }
    // Raw materials and packaging can be inputs, supplies cannot
    return [CATEGORIES.RAW_MATERIAL, CATEGORIES.PACKAGING].includes(category);
};

// Helper: Check if can be JO output
export const canBeJobOrderOutput = (category) => {
    return category === CATEGORIES.PRODUCT;
};

// Helper: Validate product_type is set correctly
export const validateProductType = (category, productType) => {
    if (category === CATEGORIES.PRODUCT) {
        if (!productType) {
            return { valid: false, error: 'product_type is required for products' };
        }
        if (!VALID_PRODUCT_TYPES.includes(productType)) {
            return { valid: false, error: `Invalid product_type: ${productType}` };
        }
    } else {
        if (productType !== null && productType !== undefined) {
            return { valid: false, error: 'product_type must be null for non-product categories' };
        }
    }
    return { valid: true };
};
