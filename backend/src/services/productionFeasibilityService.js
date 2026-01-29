/**
 * Production Feasibility Service
 *
 * Analyzes what products can be produced based on current inventory,
 * calculates raw material requirements, and handles nested product chains.
 */

import { Op } from 'sequelize';
import Item from '../models/Item.js';
import ProductComposition from '../models/ProductComposition.js';
import FIFOBatch from '../models/FIFOBatch.js';
import sequelize from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Get all producible products with their feasibility status
 * @param {Object} options - Filter options
 * @returns {Object} Categorized list of products by producibility
 */
export const getProducibleProducts = async (options = {}) => {
  try {
    const { category = null, limit = 100 } = options;

    // Get all products (items with category = 'product')
    const whereClause = { category: 'product', status: 'active' };
    if (category) {
      whereClause.product_type = category;
    }

    const products = await Item.findAll({
      where: whereClause,
      include: [{
        model: ProductComposition,
        as: 'compositions',
        required: false,
        include: [{
          model: Item,
          as: 'ingredient',
          attributes: ['item_id', 'name', 'sku_code', 'category', 'current_stock', 'unit_of_measure']
        }]
      }],
      order: [['nesting_level', 'ASC'], ['name', 'ASC']],
      limit
    });

    const result = {
      fullyProducible: [],
      partiallyProducible: [],
      notProducible: [],
      noRecipe: []
    };

    for (const product of products) {
      const feasibility = await analyzeProductFeasibility(product);

      if (!feasibility.hasRecipe) {
        result.noRecipe.push(feasibility);
      } else if (feasibility.maxProducible === 0) {
        result.notProducible.push(feasibility);
      } else if (feasibility.maxProducible < 10) {
        result.partiallyProducible.push(feasibility);
      } else {
        result.fullyProducible.push(feasibility);
      }
    }

    return {
      success: true,
      data: result,
      summary: {
        totalProducts: products.length,
        fullyProducible: result.fullyProducible.length,
        partiallyProducible: result.partiallyProducible.length,
        notProducible: result.notProducible.length,
        noRecipe: result.noRecipe.length
      }
    };
  } catch (error) {
    logger.error('Error getting producible products:', error);
    throw error;
  }
};

/**
 * Analyze feasibility for a single product
 * @param {Object} product - Product item with compositions
 * @returns {Object} Feasibility analysis
 */
const analyzeProductFeasibility = async (product) => {
  const compositions = product.compositions || [];

  if (compositions.length === 0) {
    return {
      productId: product.item_id,
      productName: product.name,
      skuCode: product.sku_code,
      productType: product.product_type,
      nestingLevel: product.nesting_level || 0,
      hasRecipe: false,
      maxProducible: 0,
      ingredients: [],
      bottleneck: null,
      message: 'No recipe defined for this product'
    };
  }

  const ingredientAnalysis = [];
  let maxProducible = Infinity;
  let bottleneck = null;

  for (const comp of compositions) {
    const ingredient = comp.ingredient;
    if (!ingredient) continue;

    const available = ingredient.current_stock || 0;
    const required = parseFloat(comp.quantity_required) || 0;

    // Calculate how many products can be made from this ingredient
    const canMake = required > 0 ? Math.floor(available / required) : Infinity;

    const analysis = {
      itemId: ingredient.item_id,
      name: ingredient.name,
      skuCode: ingredient.sku_code,
      category: ingredient.category,
      available,
      requiredPerUnit: required,
      unit: comp.unit_of_measure || ingredient.unit_of_measure,
      canMake,
      isBottleneck: false,
      shortage: canMake === 0 ? required - available : 0
    };

    if (canMake < maxProducible) {
      maxProducible = canMake;
      bottleneck = analysis;
    }

    ingredientAnalysis.push(analysis);
  }

  // Mark the bottleneck
  if (bottleneck) {
    bottleneck.isBottleneck = true;
  }

  // Handle Infinity case (no ingredients or all have infinite availability)
  if (maxProducible === Infinity) {
    maxProducible = 0;
  }

  return {
    productId: product.item_id,
    productName: product.name,
    skuCode: product.sku_code,
    productType: product.product_type,
    nestingLevel: product.nesting_level || 0,
    hasRecipe: true,
    maxProducible,
    ingredients: ingredientAnalysis,
    bottleneck: bottleneck ? {
      name: bottleneck.name,
      available: bottleneck.available,
      required: bottleneck.requiredPerUnit,
      shortage: bottleneck.shortage
    } : null,
    message: maxProducible > 0
      ? `Can produce up to ${maxProducible} units`
      : `Cannot produce - insufficient ${bottleneck?.name || 'ingredients'}`
  };
};

/**
 * Analyze production feasibility for a specific product with full chain
 * @param {number} productId - Product ID to analyze
 * @param {number} targetQuantity - Desired production quantity
 * @returns {Object} Detailed feasibility analysis
 */
export const analyzeProductionChain = async (productId, targetQuantity = 1) => {
  try {
    const product = await Item.findByPk(productId, {
      include: [{
        model: ProductComposition,
        as: 'compositions',
        include: [{
          model: Item,
          as: 'ingredient',
          attributes: ['item_id', 'name', 'sku_code', 'category', 'current_stock',
                       'unit_of_measure', 'nesting_level', 'yield_percentage', 'processing_loss']
        }]
      }]
    });

    if (!product) {
      return { success: false, error: 'Product not found' };
    }

    if (product.category !== 'product') {
      return { success: false, error: 'Item is not a product' };
    }

    // Build the full production chain
    const chain = await buildProductionChain(product, targetQuantity);

    // Calculate raw material requirements
    const rawMaterials = await calculateRawMaterialRequirements(productId, targetQuantity);

    // Check stock availability
    const stockCheck = await checkStockAvailability(rawMaterials);

    return {
      success: true,
      data: {
        product: {
          id: product.item_id,
          name: product.name,
          skuCode: product.sku_code,
          nestingLevel: product.nesting_level || 0,
          targetQuantity
        },
        productionChain: chain,
        rawMaterialRequirements: rawMaterials,
        stockAvailability: stockCheck,
        canProduce: stockCheck.allAvailable,
        maxProducible: stockCheck.maxProducible,
        shortages: stockCheck.shortages
      }
    };
  } catch (error) {
    logger.error('Error analyzing production chain:', error);
    throw error;
  }
};

/**
 * Build production chain showing all nested products that need to be made
 * @param {Object} product - Product with compositions
 * @param {number} quantity - Target quantity
 * @param {number} depth - Current recursion depth
 * @returns {Object} Production chain tree
 */
const buildProductionChain = async (product, quantity, depth = 0) => {
  const compositions = product.compositions || [];

  if (compositions.length === 0) {
    return {
      productId: product.item_id,
      productName: product.name,
      quantity,
      depth,
      isLeaf: true,
      subProducts: []
    };
  }

  const subProducts = [];

  for (const comp of compositions) {
    const ingredient = comp.ingredient;
    if (!ingredient) continue;

    const requiredQty = parseFloat(comp.quantity_required) * quantity;

    // If ingredient is a product, recursively build its chain
    if (ingredient.category === 'product') {
      const subProduct = await Item.findByPk(ingredient.item_id, {
        include: [{
          model: ProductComposition,
          as: 'compositions',
          include: [{
            model: Item,
            as: 'ingredient'
          }]
        }]
      });

      if (subProduct) {
        const subChain = await buildProductionChain(subProduct, requiredQty, depth + 1);
        subProducts.push({
          ...subChain,
          isSubProduct: true,
          requiredQuantity: requiredQty,
          availableStock: ingredient.current_stock || 0,
          needsToProduce: Math.max(0, requiredQty - (ingredient.current_stock || 0))
        });
      }
    }
  }

  return {
    productId: product.item_id,
    productName: product.name,
    quantity,
    depth,
    isLeaf: subProducts.length === 0,
    subProducts
  };
};

/**
 * Calculate raw material requirements for a product
 * Recursively expands nested products to their base ingredients
 * @param {number} productId - Product ID
 * @param {number} quantity - Target quantity
 * @param {Map} visited - Set of visited product IDs (for circular detection)
 * @returns {Array} List of raw material requirements
 */
export const calculateRawMaterialRequirements = async (productId, quantity = 1, visited = new Map()) => {
  // Circular dependency check
  if (visited.has(productId)) {
    return [];
  }
  visited.set(productId, true);

  const compositions = await ProductComposition.findAll({
    where: { product_id: productId },
    include: [{
      model: Item,
      as: 'ingredient',
      attributes: ['item_id', 'name', 'sku_code', 'category', 'current_stock',
                   'unit_of_measure', 'yield_percentage', 'processing_loss']
    }]
  });

  const rawMaterials = new Map();

  for (const comp of compositions) {
    const ingredient = comp.ingredient;
    if (!ingredient) continue;

    let requiredQty = parseFloat(comp.quantity_required) * quantity;

    // Apply yield/loss adjustments
    const yieldPct = ingredient.yield_percentage || 100;
    const lossPct = ingredient.processing_loss || 0;
    const effectiveYield = (yieldPct / 100) * (1 - lossPct / 100);

    if (effectiveYield > 0 && effectiveYield < 1) {
      requiredQty = requiredQty / effectiveYield;
    }

    if (ingredient.category === 'product') {
      // Recursively calculate raw materials for sub-product
      const subMaterials = await calculateRawMaterialRequirements(
        ingredient.item_id,
        requiredQty,
        new Map(visited)
      );

      // Merge sub-materials into our totals
      for (const material of subMaterials) {
        const existing = rawMaterials.get(material.itemId);
        if (existing) {
          existing.requiredQuantity += material.requiredQuantity;
        } else {
          rawMaterials.set(material.itemId, { ...material });
        }
      }
    } else {
      // It's a raw material or packaging
      const existing = rawMaterials.get(ingredient.item_id);
      if (existing) {
        existing.requiredQuantity += requiredQty;
      } else {
        rawMaterials.set(ingredient.item_id, {
          itemId: ingredient.item_id,
          name: ingredient.name,
          skuCode: ingredient.sku_code,
          category: ingredient.category,
          requiredQuantity: requiredQty,
          unit: comp.unit_of_measure || ingredient.unit_of_measure,
          currentStock: ingredient.current_stock || 0
        });
      }
    }
  }

  return Array.from(rawMaterials.values());
};

/**
 * Check stock availability for required materials
 * @param {Array} requirements - List of material requirements
 * @returns {Object} Availability check results
 */
const checkStockAvailability = async (requirements) => {
  const shortages = [];
  let allAvailable = true;
  let maxProducible = Infinity;

  for (const req of requirements) {
    // Get fresh stock data including FIFO batches
    const item = await Item.findByPk(req.itemId, {
      include: [{
        model: FIFOBatch,
        as: 'batches',
        where: { remaining_quantity: { [Op.gt]: 0 } },
        required: false,
        order: [['expiry_date', 'ASC'], ['created_at', 'ASC']]
      }]
    });

    const availableStock = item?.current_stock || 0;
    const batchCount = item?.batches?.length || 0;

    // Check if we have expiring batches
    const expiringBatches = item?.batches?.filter(b => {
      if (!b.expiry_date) return false;
      const daysUntilExpiry = Math.ceil((new Date(b.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry <= 7;
    }) || [];

    const isAvailable = availableStock >= req.requiredQuantity;
    const shortage = Math.max(0, req.requiredQuantity - availableStock);
    const ratio = req.requiredQuantity > 0 ? availableStock / req.requiredQuantity : Infinity;

    if (!isAvailable) {
      allAvailable = false;
      shortages.push({
        itemId: req.itemId,
        name: req.name,
        skuCode: req.skuCode,
        required: req.requiredQuantity,
        available: availableStock,
        shortage,
        unit: req.unit
      });
    }

    // Calculate max producible based on this ingredient
    if (ratio < maxProducible) {
      maxProducible = ratio;
    }

    // Add batch info to requirement
    req.availableStock = availableStock;
    req.batchCount = batchCount;
    req.expiringBatches = expiringBatches.length;
    req.isAvailable = isAvailable;
    req.shortage = shortage;
  }

  return {
    allAvailable,
    maxProducible: maxProducible === Infinity ? 0 : Math.floor(maxProducible),
    totalIngredients: requirements.length,
    availableCount: requirements.filter(r => r.isAvailable).length,
    shortages
  };
};

/**
 * Get production recommendations based on current stock
 * @param {Object} options - Filter options
 * @returns {Object} Production recommendations
 */
export const getProductionRecommendations = async (options = {}) => {
  try {
    const { limit = 10 } = options;

    // Get products that can be produced
    const producible = await getProducibleProducts({ limit: 50 });

    // Sort by producibility and priority
    const recommendations = [];

    // Prioritize finished goods that can be fully produced
    for (const product of producible.data.fullyProducible) {
      if (product.productType === 'finished_goods') {
        recommendations.push({
          ...product,
          priority: 'high',
          reason: 'Finished goods with sufficient ingredients'
        });
      }
    }

    // Then WIP products
    for (const product of producible.data.fullyProducible) {
      if (product.productType === 'work_in_progress') {
        recommendations.push({
          ...product,
          priority: 'medium',
          reason: 'Work-in-progress with sufficient ingredients'
        });
      }
    }

    // Then partially producible items
    for (const product of producible.data.partiallyProducible) {
      recommendations.push({
        ...product,
        priority: 'low',
        reason: `Limited production possible (max ${product.maxProducible} units)`
      });
    }

    return {
      success: true,
      data: recommendations.slice(0, limit),
      summary: {
        totalRecommendations: recommendations.length,
        highPriority: recommendations.filter(r => r.priority === 'high').length,
        mediumPriority: recommendations.filter(r => r.priority === 'medium').length,
        lowPriority: recommendations.filter(r => r.priority === 'low').length
      }
    };
  } catch (error) {
    logger.error('Error getting production recommendations:', error);
    throw error;
  }
};

/**
 * Analyze what's blocking production for a product
 * @param {number} productId - Product ID
 * @returns {Object} Blocking factors analysis
 */
export const analyzeProductionBlockers = async (productId) => {
  try {
    const analysis = await analyzeProductionChain(productId, 1);

    if (!analysis.success) {
      return analysis;
    }

    const blockers = [];
    const { shortages, stockAvailability } = analysis.data;

    // Direct ingredient shortages
    for (const shortage of shortages) {
      blockers.push({
        type: 'ingredient_shortage',
        severity: 'critical',
        itemId: shortage.itemId,
        itemName: shortage.name,
        required: shortage.required,
        available: shortage.available,
        shortage: shortage.shortage,
        unit: shortage.unit,
        suggestion: `Order ${Math.ceil(shortage.shortage)} ${shortage.unit} of ${shortage.name}`
      });
    }

    // Check for sub-product availability
    const chain = analysis.data.productionChain;
    if (chain.subProducts) {
      for (const sub of chain.subProducts) {
        if (sub.needsToProduce > 0) {
          blockers.push({
            type: 'subproduct_needed',
            severity: 'warning',
            productId: sub.productId,
            productName: sub.productName,
            quantityNeeded: sub.needsToProduce,
            availableStock: sub.availableStock,
            suggestion: `Produce ${Math.ceil(sub.needsToProduce)} units of ${sub.productName} first`
          });
        }
      }
    }

    return {
      success: true,
      data: {
        productId,
        canProduce: analysis.data.canProduce,
        maxProducible: analysis.data.maxProducible,
        blockers,
        hasBlockers: blockers.length > 0,
        criticalBlockers: blockers.filter(b => b.severity === 'critical').length,
        warningBlockers: blockers.filter(b => b.severity === 'warning').length
      }
    };
  } catch (error) {
    logger.error('Error analyzing production blockers:', error);
    throw error;
  }
};

export default {
  getProducibleProducts,
  analyzeProductionChain,
  calculateRawMaterialRequirements,
  getProductionRecommendations,
  analyzeProductionBlockers
};
