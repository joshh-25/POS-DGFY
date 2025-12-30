/**
 * Helper functions for product details display
 */

/**
 * Check if an object has any non-null, non-empty values
 * @param {Object} obj - Object to check
 * @returns {boolean}
 */
const hasValues = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  return Object.values(obj).some(val =>
    val !== null && val !== undefined && val !== '' &&
    (typeof val !== 'number' || !isNaN(val))
  );
};

/**
 * Check if product has nutritional information
 * @param {Object} item - Product item
 * @returns {boolean}
 */
export const hasNutritionalInfo = (item) => {
  return hasValues(item?.nutritional_info);
};

/**
 * Check if product has allergen information
 * @param {Object} item - Product item
 * @returns {boolean}
 */
export const hasAllergens = (item) => {
  const hasAllergenList = item?.allergens && Array.isArray(item.allergens) && item.allergens.length > 0;
  const hasMayContain = item?.may_contain_allergens && Array.isArray(item.may_contain_allergens) && item.may_contain_allergens.length > 0;
  return hasAllergenList || hasMayContain;
};

/**
 * Check if product has physical properties
 * @param {Object} item - Product item
 * @returns {boolean}
 */
export const hasPhysicalProperties = (item) => {
  return hasValues(item?.physical_properties);
};

/**
 * Check if product has shelf life information
 * @param {Object} item - Product item
 * @returns {boolean}
 */
export const hasShelfLife = (item) => {
  return hasValues(item?.shelf_life);
};

/**
 * Check if product has packaging information
 * @param {Object} item - Product item
 * @returns {boolean}
 */
export const hasPackagingInfo = (item) => {
  return hasValues(item?.packaging_info);
};

/**
 * Check if product has quality control information
 * @param {Object} item - Product item
 * @returns {boolean}
 */
export const hasQualityControl = (item) => {
  return hasValues(item?.quality_control);
};

/**
 * Check if product has regulatory compliance information
 * @param {Object} item - Product item
 * @returns {boolean}
 */
export const hasRegulatoryCompliance = (item) => {
  return hasValues(item?.regulatory_compliance);
};

/**
 * Check if product has yield management data
 * @param {Object} item - Product item
 * @returns {boolean}
 */
export const hasYieldManagement = (item) => {
  return (
    (item?.batch_size && item.batch_size > 0) ||
    (item?.yield_percentage && item.yield_percentage !== 100) ||
    (item?.processing_loss && item.processing_loss > 0) ||
    (item?.production_notes && item.production_notes.trim() !== '')
  );
};

/**
 * Check if product has ingredients or packaging items
 * @param {Object} item - Product item
 * @returns {boolean}
 */
export const hasRecipeData = (item) => {
  const hasIngredients = item?.ingredients && Array.isArray(item.ingredients) && item.ingredients.length > 0;
  const hasPackaging = item?.packaging_items && Array.isArray(item.packaging_items) && item.packaging_items.length > 0;
  return hasIngredients || hasPackaging;
};

/**
 * Calculate total product cost including all components
 * @param {Object} item - Product item
 * @returns {number}
 */
export const calculateTotalProductCost = (item) => {
  if (!item) return 0;

  const costPerUnit = parseFloat(item.cost_per_unit) || 0;
  const laborCost = parseFloat(item.labor_cost) || 0;
  const overheadCost = parseFloat(item.overhead_cost) || 0;
  const packagingCost = parseFloat(item.additional_packaging_cost) || 0;

  return costPerUnit + laborCost + overheadCost + packagingCost;
};

/**
 * Check if product has cost breakdown (more than just cost_per_unit)
 * @param {Object} item - Product item
 * @returns {boolean}
 */
export const hasCostBreakdown = (item) => {
  return (
    (item?.labor_cost && item.labor_cost > 0) ||
    (item?.overhead_cost && item.overhead_cost > 0) ||
    (item?.additional_packaging_cost && item.additional_packaging_cost > 0)
  );
};

/**
 * Format allergen name for display
 * @param {string} allergen - Allergen code
 * @returns {string}
 */
export const formatAllergenName = (allergen) => {
  const allergenMap = {
    'milk': 'Milk',
    'eggs': 'Eggs',
    'fish': 'Fish',
    'shellfish': 'Shellfish',
    'tree_nuts': 'Tree Nuts',
    'peanuts': 'Peanuts',
    'wheat': 'Wheat',
    'soybeans': 'Soybeans',
    'sesame': 'Sesame'
  };
  return allergenMap[allergen] || allergen;
};
