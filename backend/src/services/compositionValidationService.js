import dbStore from '../utils/dbStore.js';
import { getRedisClient, isRedisConnected } from '../config/redis.js';
import logger from '../config/logger.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';

const MAX_NESTING_DEPTH = 3;
const CACHE_TTL = 300;
const getCacheKey = () => {
    const store = dbStore.getStore();
    const tenantId = store?.tenantId || 'global';
    return `composition:dependency_graph:${tenantId}`;
};

/**
 * Build a dependency graph from all product compositions
 * @returns {Object} Adjacency list: { productId: [ingredientId1, ingredientId2, ...] }
 */
export const buildDependencyGraph = async () => {
    // Try to get from cache first
    if (isRedisConnected()) {
        try {
            const redis = getRedisClient();
            const cacheKey = getCacheKey();
            const cached = await redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (error) {
            logger.warn('Failed to get dependency graph from cache:', error.message);
        }
    }

    // Build graph from database
    const ProductComposition = dbStore.get('ProductComposition');
    const compositions = await ProductComposition.findAll({
        attributes: ['product_id', 'ingredient_id']
    });

    const graph = {};
    for (const comp of compositions) {
        const productId = comp.product_id.toString();
        const ingredientId = comp.ingredient_id.toString();

        if (!graph[productId]) {
            graph[productId] = [];
        }
        graph[productId].push(ingredientId);
    }

    // Cache the graph
    if (isRedisConnected()) {
        try {
            const redis = getRedisClient();
            const cacheKey = getCacheKey();
            await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(graph));
        } catch (error) {
            logger.warn('Failed to cache dependency graph:', error.message);
        }
    }

    return graph;
};

/**
 * Invalidate the cached dependency graph
 * Call this after any ProductComposition changes
 */
export const invalidateDependencyGraphCache = async () => {
    if (isRedisConnected()) {
        try {
            const redis = getRedisClient();
            const cacheKey = getCacheKey();
            await redis.del(cacheKey);
        } catch (error) {
            logger.warn('Failed to invalidate dependency graph cache:', error.message);
        }
    }
};

/**
 * Check if adding an ingredient would create a circular dependency
 * Uses DFS to detect cycles
 * @param {string} ingredientId - The ingredient being added
 * @param {string} productId - The product receiving the ingredient
 * @param {Object} graph - Dependency graph
 * @param {Set} visited - Already visited nodes in current path
 * @param {Array} path - Current path for error reporting
 * @returns {Object} { isCircular: boolean, path?: string[] }
 */
export const hasCircularDependency = (ingredientId, productId, graph, visited = new Set(), path = []) => {
    // Direct circular: product uses itself
    if (ingredientId === productId) {
        return { isCircular: true, path: [...path, ingredientId, productId] };
    }

    // If ingredient has no dependencies (leaf node), no circular possible
    if (!graph[ingredientId]) {
        return { isCircular: false };
    }

    // Check if this creates a path back to productId
    if (visited.has(ingredientId)) {
        return { isCircular: false }; // Already checked this branch
    }

    visited.add(ingredientId);
    path.push(ingredientId);

    for (const childId of graph[ingredientId]) {
        if (childId === productId) {
            return { isCircular: true, path: [...path, productId] };
        }

        const result = hasCircularDependency(childId, productId, graph, visited, [...path]);
        if (result.isCircular) {
            return result;
        }
    }

    return { isCircular: false };
};

/**
 * Calculate the nesting level for a product based on its ingredients
 * Level 0: Raw ingredients only (category !== 'product')
 * Level 1+: Max child depth + 1
 * @param {number} productId - The product being evaluated
 * @param {number[]} ingredientIds - Array of ingredient item IDs
 * @returns {Promise<number>} Nesting level (0-3)
 */
export const calculateNestingLevel = async (productId, ingredientIds) => {
    if (!ingredientIds || ingredientIds.length === 0) {
        return 0;
    }

    // Get all ingredients with their categories and nesting levels
    const Item = dbStore.get('Item');
    const ingredients = await Item.findAll({
        where: buildVisibleWhere(
            { item_id: ingredientIds },
            { statusField: 'status', excludeInactiveStatus: true }
        ),
        attributes: ['item_id', 'category', 'nesting_level']
    });

    let maxChildLevel = -1;

    for (const ingredient of ingredients) {
        if (ingredient.category === 'product') {
            // This ingredient is a product, so we're nesting
            const childLevel = ingredient.nesting_level || 0;
            maxChildLevel = Math.max(maxChildLevel, childLevel);
        }
    }

    // If no product ingredients, this is level 0 (uses only raw ingredients)
    // Otherwise, it's max child level + 1
    return maxChildLevel === -1 ? 0 : maxChildLevel + 1;
};

/**
 * Validate a product composition for circular dependencies and depth limits
 * @param {number|null} productId - The product ID (null for new products)
 * @param {number[]} ingredientIds - Array of proposed ingredient item IDs
 * @returns {Promise<Object>} { valid: boolean, errors: string[], nestingLevel: number }
 */
export const validateComposition = async (productId, ingredientIds) => {
    const errors = [];
    const productIdStr = productId?.toString();

    // Filter out empty/null ingredient IDs
    const validIngredientIds = ingredientIds
        .filter(id => id != null && id !== '')
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));

    if (validIngredientIds.length === 0) {
        return { valid: true, errors: [], nestingLevel: 0 };
    }

    // Validate all ingredient IDs exist and are visible.
    const Item = dbStore.get('Item');
    const ingredientRecords = await Item.findAll({
        where: buildVisibleWhere(
            { item_id: validIngredientIds },
            { statusField: 'status', excludeInactiveStatus: true }
        ),
        attributes: ['item_id']
    });
    const visibleIngredientIds = new Set(ingredientRecords.map(i => i.item_id));
    const missingIngredientIds = validIngredientIds.filter(id => !visibleIngredientIds.has(id));
    if (missingIngredientIds.length > 0) {
        errors.push({
            type: 'INGREDIENT_NOT_FOUND',
            message: `Ingredient item(s) not found or inactive: ${missingIngredientIds.join(', ')}`
        });
        return { valid: false, errors, nestingLevel: 0 };
    }

    // Check for direct self-reference
    if (productId && validIngredientIds.includes(parseInt(productId, 10))) {
        errors.push({
            type: 'DIRECT_CIRCULAR',
            message: 'A product cannot use itself as an ingredient'
        });
        return { valid: false, errors, nestingLevel: 0 };
    }

    // Build or get cached dependency graph
    const graph = await buildDependencyGraph();

    // Check for indirect circular dependencies
    for (const ingredientId of validIngredientIds) {
        const ingredientIdStr = ingredientId.toString();

        // Only check if ingredient is a product (has dependencies)
        if (graph[ingredientIdStr] && productIdStr) {
            const result = hasCircularDependency(ingredientIdStr, productIdStr, graph);
            if (result.isCircular) {
                const pathStr = result.path.join(' → ');
                errors.push({
                    type: 'INDIRECT_CIRCULAR',
                    message: `Circular dependency detected: ${pathStr}`,
                    path: result.path
                });
            }
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors, nestingLevel: 0 };
    }

    // Calculate nesting level
    const nestingLevel = await calculateNestingLevel(productId, validIngredientIds);

    // Check depth limit
    if (nestingLevel > MAX_NESTING_DEPTH) {
        errors.push({
            type: 'DEPTH_EXCEEDED',
            message: `Maximum nesting depth of ${MAX_NESTING_DEPTH} levels exceeded (this would create level ${nestingLevel})`,
            currentLevel: nestingLevel,
            maxLevel: MAX_NESTING_DEPTH
        });
        return { valid: false, errors, nestingLevel };
    }

    return { valid: true, errors: [], nestingLevel };
};

/**
 * Get all product IDs that use a given ingredient
 * @param {number} ingredientId - The ingredient item ID
 * @returns {Promise<number[]>} Array of product IDs using this ingredient
 */
export const getProductsUsingIngredient = async (ingredientId) => {
    const ProductComposition = dbStore.get('ProductComposition');
    const compositions = await ProductComposition.findAll({
        where: { ingredient_id: ingredientId },
        attributes: ['product_id']
    });

    return compositions.map(c => c.product_id);
};

export default {
    validateComposition,
    buildDependencyGraph,
    invalidateDependencyGraphCache,
    hasCircularDependency,
    calculateNestingLevel,
    getProductsUsingIngredient
};
