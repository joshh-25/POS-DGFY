import api from '../../src/services/api';
import { toast } from 'sonner';

/**
 * Validate product composition against backend rules
 * Checks for circular dependencies and nesting depth limits
 * @param {number|null} productId - The product ID (null for new products)
 * @param {Array} ingredients - Array of ingredient objects with item_id
 * @returns {Promise<Object>} { valid, errors, nestingLevel }
 */
export const validateComposition = async (productId, ingredients) => {
    try {
        // Extract ingredient IDs
        const ingredientIds = ingredients
            .filter(ing => ing.item_id)
            .map(ing => parseInt(ing.item_id, 10))
            .filter(id => !isNaN(id));

        if (ingredientIds.length === 0) {
            return { valid: true, errors: [], nestingLevel: 0 };
        }

        const response = await api.post('/items/validate-composition', {
            product_id: productId,
            ingredient_ids: ingredientIds
        });

        return response.data.data;
    } catch (error) {
        console.error('Composition validation failed:', error);

        // Return a safe default on error
        return {
            valid: true, // Allow submission on validation service failure
            errors: [],
            nestingLevel: 0,
            warning: 'Could not validate composition - proceed with caution'
        };
    }
};

/**
 * Format validation errors for display
 * @param {Array} errors - Array of error objects from backend
 * @returns {Array} Array of { title, message } for toast display
 */
export const formatValidationErrors = (errors) => {
    return errors.map(error => {
        switch (error.type) {
            case 'DIRECT_CIRCULAR':
                return {
                    title: 'Circular Dependency',
                    message: 'A product cannot use itself as an ingredient',
                    type: 'error'
                };
            case 'INDIRECT_CIRCULAR':
                return {
                    title: 'Circular Dependency Detected',
                    message: error.message || 'This would create a circular dependency chain',
                    type: 'error'
                };
            case 'DEPTH_EXCEEDED':
                return {
                    title: 'Maximum Nesting Depth Exceeded',
                    message: error.message || 'Maximum of 3 nesting levels allowed',
                    type: 'error'
                };
            default:
                return {
                    title: 'Composition Error',
                    message: error.message || 'Invalid composition',
                    type: 'error'
                };
        }
    });
};

/**
 * Display validation errors as toasts
 * @param {Array} errors - Array of error objects from backend
 */
export const showValidationErrors = (errors) => {
    const formatted = formatValidationErrors(errors);
    formatted.forEach(err => {
        toast.error(err.title, { description: err.message });
    });
};

/**
 * Check if any ingredients are products (for UI hints)
 * @param {Array} ingredients - Array of ingredient objects
 * @param {Array} items - All available items
 * @returns {boolean}
 */
export const hasProductIngredients = (ingredients, items) => {
    if (!ingredients || !items) return false;

    return ingredients.some(ing => {
        const item = items.find(i => i.item_id === parseInt(ing.item_id, 10));
        return item?.category === 'product';
    });
};

/**
 * Get the maximum nesting level from selected ingredients
 * @param {Array} ingredients - Array of ingredient objects
 * @param {Array} items - All available items
 * @returns {number}
 */
export const getMaxIngredientNestingLevel = (ingredients, items) => {
    if (!ingredients || !items) return 0;

    let maxLevel = 0;
    ingredients.forEach(ing => {
        const item = items.find(i => i.item_id === parseInt(ing.item_id, 10));
        if (item?.category === 'product' && (item.nesting_level || 0) > maxLevel) {
            maxLevel = item.nesting_level;
        }
    });

    return maxLevel;
};

export default {
    validateComposition,
    formatValidationErrors,
    showValidationErrors,
    hasProductIngredients,
    getMaxIngredientNestingLevel
};
