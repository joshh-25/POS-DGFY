import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { validateComposition, invalidateDependencyGraphCache } from './compositionValidationService.js';
import { generateEmbedding, searchByMeaning, syncItemEmbedding } from './embeddingService.js';
import { getVariations } from '../config/searchSynonyms.js';
import { getAllSettings } from './settingsService.js';
import { createStockMovement } from './stockMovementService.js';

// Cache for system settings — avoids a DB query on every item create/update.
// Keyed by companyToken (from AsyncLocalStorage) so tenants don't cross-contaminate.
// Settings change very rarely, so a 5-minute TTL is safe.
const _settingsCache = new Map(); // companyToken -> { settings, expiresAt }
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Calculate min_threshold and purchase_allowance based on max_capacity
 * Reads settings from system settings table:
 * - enable_auto_reorder: If false, returns null thresholds
 * - min_stock_threshold_percent: Percentage for min_threshold (default 40%)
 * - purchase_allowance_percent: Percentage for purchase_allowance (default 20%)
 * @param {number} maxCapacity - The item's max capacity
 * @returns {Promise<object>} Object with min_threshold and purchase_allowance
 */
const calculateThresholds = async (maxCapacity) => {
  // Key the cache by tenant so different tenants don't share each other's settings.
  // dbStore.getStore() returns the current request's AsyncLocalStorage context.
  const store = dbStore.getStore();
  const tenantKey = store?.tenantId ?? 'default';
  const cached = _settingsCache.get(tenantKey);
  let settings;
  if (cached && cached.expiresAt > Date.now()) {
    settings = cached.settings;
  } else {
    settings = await getAllSettings();
    _settingsCache.set(tenantKey, { settings, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS });
  }
  const autoCalc = settings.enable_auto_reorder?.value ?? true; // Default ON for backward compatibility

  // If auto-calculate is OFF, return null thresholds
  if (!autoCalc) {
    return { min_threshold: null, purchase_allowance: null };
  }

  // If no max capacity, return null thresholds
  if (!maxCapacity || maxCapacity <= 0) {
    return { min_threshold: null, purchase_allowance: null };
  }

  // Read percentage values from settings (defaults: 40% and 20%)
  const minPercent = (settings.min_stock_threshold_percent?.value || 40) / 100;
  const allowancePercent = (settings.purchase_allowance_percent?.value || 20) / 100;

  return {
    min_threshold: Math.round(maxCapacity * minPercent),
    purchase_allowance: Math.round(maxCapacity * allowancePercent)
  };
};

/**
 * Calculate product cost from recipe ingredients and packaging
 * @param {Array} productCompositions - Array of composition items with ingredient data
 * @returns {number} Total cost from all recipe components
 */
const calculateRecipeCost = (productCompositions) => {
  if (!productCompositions || productCompositions.length === 0) {
    return 0;
  }

  return productCompositions.reduce((total, comp) => {
    const ingredientCost = parseFloat(comp.ingredient?.cost_per_unit || 0);
    const quantity = parseFloat(comp.quantity_required || 0);
    return total + (ingredientCost * quantity);
  }, 0);
};

export const getItems = async (queryParams) => {
  // Get models from tenant context
  const Item = dbStore.get('Item');
  const ProductComposition = dbStore.get('ProductComposition');
  const ItemFolder = dbStore.get('ItemFolder');

  // Lightweight dropdown path — skips all joins and semantic search.
  // Used by create/edit wizards that only need a name+id list for <select> dropdowns.
  if (queryParams.fields === 'dropdown') {
    const { limit = 1000, category, status } = queryParams;
    const where = { status: { [Op.ne]: 'inactive' } };
    if (category) where.category = category;
    if (status) where.status = status;

    const rows = await Item.findAll({
      where,
      attributes: ['item_id', 'sku_code', 'name', 'unit_of_measure', 'category', 'current_stock'],
      order: [['name', 'ASC']],
      limit: parseInt(limit),
    });

    const items = rows.map(item => ({ ...item.toJSON(), id: item.item_id }));
    return { items, pagination: { page: 1, limit: parseInt(limit), total: items.length, pages: 1 } };
  }

  const {
    page = 1,
    limit = 20,
    category,
    search,
    sortBy = 'name',
    sortOrder = 'asc',
    status
  } = queryParams;

  const offset = (page - 1) * limit;
  const where = {};

  let semanticIds = [];

  // Semantic Search Pre-fetch
  if (search && search.length > 2) {
    try {
      const semanticResults = await searchByMeaning(search, 50, 0.4);
      if (semanticResults.length > 0) {
        semanticIds = semanticResults.map(r => r.item_id);
      }
    } catch (err) {
      // Silent fail (log debug) to ensure main search still works
      console.error("Semantic search failed", err);
    }
  }

  // Filter by category
  if (category) {
    where.category = category;
  }

  // Filter by status (draft/active/inactive)
  if (status) {
    where.status = status;
  } else {
    // By default, exclude inactive (deleted) items
    where.status = { [Op.ne]: 'inactive' };
  }

  // Filter by folder
  if (queryParams.folder_id) {
    if (queryParams.folder_id === 'null' || queryParams.folder_id === 'none') {
      where.folder_id = null; // Filter for items currently NOT in a folder
    } else {
      where.folder_id = queryParams.folder_id;
    }
  }

  // Smart Search: Handle multi-word queries and flexible separators
  if (search) {
    const cleanSearch = search.trim();
    // Split by spaces to allow "word salad" matching (e.g. "red apple" matches "apple red")
    const terms = cleanSearch.split(/\s+/).filter(t => t.length > 0);

    if (terms.length > 0) {
      // Create an AND condition where EACH term must match at least one field
      where[Op.and] = terms.map(term => {
        // Get all variations from config (synonyms + basic stemming)
        const variations = getVariations(term);

        // Construct OR block for this term (and its variations) against all fields
        return {
          [Op.or]: [
            // Name matches ANY variation
            ...variations.map(v => ({ name: { [Op.like]: `%${v}%` } })),
            // SKU matches ANY variation
            ...variations.map(v => ({ sku_code: { [Op.like]: `%${v}%` } })),
            // Description matches ANY variation
            ...variations.map(v => ({ description: { [Op.like]: `%${v}%` } }))
          ]
        };
      });
    }

    // INTEGRATION: If we have semantic matches, add them to the OR condition
    if (semanticIds && semanticIds.length > 0) {
      // If keyword logic creates a complex AND, we want to allow Semantic Matches via OR
      // BUT strict keyword matches are usually better?
      // Let's make it: (Keywords Match) OR (ID IN SemanticIDs)

      // This is tricky with Sequelize 'where' object structure.
      // Easiest way:
      // If keyword search returns results, great.
      // But we want to mix them.

      // Current logic: where[Op.and] = terms...

      // We can wrap the entire existing search logic in an OR with semantic IDs?
      // OR: We just add semanticIds to the results of the specific keyword check?

      // Let's modify approach.
      // We will stick to the plan:
      // If keyword search is too strict, we might miss semantic matches.

      // Let's add a top-level OR for semantic IDs if they exist.
      if (where[Op.and]) {
        const keywordLogic = where[Op.and];
        delete where[Op.and]; // Remove strict constraint temporarily

        where[Op.or] = [
          { [Op.and]: keywordLogic }, // Original keyword logic
          { item_id: { [Op.in]: semanticIds } } // Semantic matches
        ];
      } else {
        // If no Op.and was set (unlikely inside search block), just use semantic
        where.item_id = { [Op.in]: semanticIds };
      }
    }
  }


  // Sort order
  const order = [[sortBy, sortOrder.toUpperCase()]];

  const { count, rows } = await Item.findAndCountAll({
    where,
    include: [
      {
        model: ProductComposition,
        as: 'productCompositions',
        required: false, // LEFT JOIN - only load for products that have compositions
        include: [{
          model: Item,
          as: 'ingredient',
          attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'current_stock', 'cost_per_unit']
        }]
      },
      {
        model: ItemFolder,
        as: 'folder',
        attributes: ['folder_id', 'name']
      }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order
  });



  // Transform items to include 'id' field and format ingredients for products
  const transformedItems = rows.map(item => {
    const itemData = item.toJSON();

    // Add 'id' field for frontend compatibility (maps item_id to id)
    const transformed = {
      ...itemData,
      id: itemData.item_id
    };

    // For products, format ingredients if they exist
    if (itemData.category === 'product' && itemData.productCompositions && itemData.productCompositions.length > 0) {
      transformed.ingredients = itemData.productCompositions
        .filter(comp => comp.composition_type === 'ingredient')
        .map(comp => ({
          item_id: comp.ingredient_id,
          item_name: comp.ingredient?.name || '',
          quantity: comp.quantity_required,
          unit: comp.ingredient?.unit_of_measure || 'units'
        }));

      // Clean up - remove raw compositions from response
      delete transformed.productCompositions;
    } else {
      delete transformed.productCompositions;
    }

    // Calculate recipe cost for products
    if (itemData.category === 'product') {
      transformed.recipe_cost = calculateRecipeCost(itemData.productCompositions);
    }

    return transformed;
  });

  // DEBUG: Log transformed products
  const transformedProduct = transformedItems.find(p => p.category === 'product');
  if (transformedProduct) {
    console.log('=== TRANSFORMED PRODUCT (AFTER MAPPING) ===');
    console.log('Product name:', transformedProduct.name);
    console.log('Has ingredients:', !!transformedProduct.ingredients);
    console.log('Ingredients count:', transformedProduct.ingredients?.length || 0);
    console.log('Ingredients:', JSON.stringify(transformedProduct.ingredients, null, 2));
  }

  return {
    items: transformedItems,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  };
};

export const getItemById = async (itemId) => {
  // Get models from tenant context
  const Item = dbStore.get('Item');
  const ItemNutrition = dbStore.get('ItemNutrition');
  const ItemAllergen = dbStore.get('ItemAllergen');
  const ItemPhysicalProperties = dbStore.get('ItemPhysicalProperties');
  const ItemShelfLife = dbStore.get('ItemShelfLife');
  const ItemPackaging = dbStore.get('ItemPackaging');
  const ItemQualityControl = dbStore.get('ItemQualityControl');
  const ItemRegulatoryCompliance = dbStore.get('ItemRegulatoryCompliance');
  const ItemCostBreakdown = dbStore.get('ItemCostBreakdown');
  const ProductComposition = dbStore.get('ProductComposition');
  const FIFOBatch = dbStore.get('FIFOBatch');
  const SupplierItem = dbStore.get('SupplierItem');
  const Supplier = dbStore.get('Supplier');

  const item = await Item.findByPk(itemId, {
    include: [
      {
        model: ItemNutrition,
        as: 'nutrition',
        required: false
      },
      {
        model: ItemAllergen,
        as: 'allergens',
        required: false
      },
      {
        model: ItemPhysicalProperties,
        as: 'physicalProperties',
        required: false
      },
      {
        model: ItemShelfLife,
        as: 'shelfLife',
        required: false
      },
      {
        model: ItemPackaging,
        as: 'packaging',
        required: false
      },
      {
        model: ItemQualityControl,
        as: 'qualityControl',
        required: false
      },
      {
        model: ItemRegulatoryCompliance,
        as: 'regulatoryCompliance',
        required: false
      },
      {
        model: ItemCostBreakdown,
        as: 'costBreakdown',
        required: false
      },
      {
        model: ProductComposition,
        as: 'productCompositions',
        required: false,
        include: [
          {
            model: Item,
            as: 'ingredient',
            required: false
          }
        ]
      },
      {
        model: FIFOBatch,
        as: 'fifoBatches',
        required: false
      },
      {
        model: SupplierItem,
        as: 'supplierItems',
        required: false,
        include: [
          {
            model: Supplier,
            as: 'supplier',
            required: false
          }
        ]
      },
      {
        model: dbStore.get('ItemFolder'),
        as: 'folder',
        required: false
      }
    ]
  });

  if (!item) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  // Format response
  const formattedItem = item.toJSON();

  // Format suppliers
  formattedItem.suppliers = formattedItem.supplierItems?.map(si => ({
    supplier_id: si.supplier.supplier_id,
    name: si.supplier.name,
    moq: si.moq,
    price_per_unit: si.price_per_unit
  })) || [];

  delete formattedItem.supplierItems;

  // Format allergens for wizard compatibility
  if (formattedItem.allergens && Array.isArray(formattedItem.allergens)) {
    const directAllergens = formattedItem.allergens
      .filter(a => !a.is_cross_contamination)
      .map(a => a.allergen_name);

    const mayContainAllergens = formattedItem.allergens
      .filter(a => a.is_cross_contamination)
      .map(a => a.allergen_name);

    formattedItem.allergens = directAllergens;
    formattedItem.may_contain_allergens = mayContainAllergens;
  }

  // Format relational data to match wizard expected property names
  if (formattedItem.nutrition) {
    formattedItem.nutritional_info = formattedItem.nutrition;
    delete formattedItem.nutrition;
  }

  if (formattedItem.physicalProperties) {
    formattedItem.physical_properties = formattedItem.physicalProperties;
    delete formattedItem.physicalProperties;
  }

  if (formattedItem.shelfLife) {
    formattedItem.shelf_life = formattedItem.shelfLife;
    delete formattedItem.shelfLife;
  }

  if (formattedItem.packaging) {
    formattedItem.packaging_info = formattedItem.packaging;
    delete formattedItem.packaging;
  }

  if (formattedItem.qualityControl) {
    formattedItem.quality_control = formattedItem.qualityControl;
    delete formattedItem.qualityControl;
  }

  if (formattedItem.regulatoryCompliance) {
    formattedItem.regulatory_compliance = formattedItem.regulatoryCompliance;
    delete formattedItem.regulatoryCompliance;
  }

  if (formattedItem.costBreakdown) {
    formattedItem.labor_cost = formattedItem.costBreakdown.labor_cost;
    formattedItem.overhead_cost = formattedItem.costBreakdown.overhead_cost;
    formattedItem.additional_packaging_cost = formattedItem.costBreakdown.additional_packaging_cost;
    delete formattedItem.costBreakdown;
  }

  // Format product compositions into ingredients and packaging items
  if (formattedItem.productCompositions) {
    formattedItem.ingredients = formattedItem.productCompositions
      .filter(comp => comp.composition_type === 'ingredient')
      .map(comp => ({
        item_id: comp.ingredient_id,
        item_name: comp.ingredient?.name,
        quantity: comp.quantity_required,
        unit_of_measure: comp.ingredient?.unit_of_measure
      }));

    formattedItem.packaging_items = formattedItem.productCompositions
      .filter(comp => comp.composition_type === 'packaging')
      .map(comp => ({
        item_id: comp.ingredient_id,
        item_name: comp.ingredient?.name,
        quantity: comp.quantity_required,
        unit_of_measure: comp.ingredient?.unit_of_measure
      }));

    delete formattedItem.productCompositions;

    // Calculate recipe cost from all compositions (ingredients + packaging)
    formattedItem.recipe_cost = calculateRecipeCost(item.productCompositions);
  }

  // Format FIFO batches to match frontend expectation (snake_case)
  if (formattedItem.fifoBatches) {
    formattedItem.fifo_batches = formattedItem.fifoBatches;
    delete formattedItem.fifoBatches;
  }

  return formattedItem;
};

export const createItem = async (itemData, userId = null) => {
  // Get models and sequelize from tenant context
  const Item = dbStore.get('Item');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();

  try {
    // Only check SKU uniqueness for non-draft items
    if (itemData.status !== 'draft' && itemData.sku_code) {
      const existingItem = await Item.findOne({
        where: {
          sku_code: itemData.sku_code,
          status: { [Op.notIn]: ['draft', 'inactive'] } // Exclude drafts AND soft-deleted items
        }
      });

      if (existingItem) {
        const error = new Error('Item with this SKU code already exists');
        error.statusCode = 409;
        throw error;
      }
    }

    // Separate wizard-specific fields from database fields
    const {
      labor_cost,
      overhead_cost,
      additional_packaging_cost,
      ingredients,
      packaging_items,
      nutritional_info,
      allergens,
      may_contain_allergens,
      physical_properties,
      shelf_life,
      packaging_info,
      quality_control,
      regulatory_compliance,
      ...dbFields
    } = itemData;

    // For draft products, store wizard data in wizard_metadata
    if (itemData.status === 'draft') {
      dbFields.wizard_metadata = {
        ...dbFields.wizard_metadata,
        labor_cost,
        overhead_cost,
        additional_packaging_cost,
        ingredients,
        packaging_items,
        nutritional_info,
        allergens,
        may_contain_allergens,
        physical_properties,
        shelf_life,
        packaging_info,
        quality_control,
        regulatory_compliance
      };
    }

    // Auto-calculate thresholds based on max_capacity (enforced server-side)
    if (dbFields.max_capacity) {
      const thresholds = await calculateThresholds(dbFields.max_capacity);
      dbFields.min_threshold = thresholds.min_threshold;
      dbFields.purchase_allowance = thresholds.purchase_allowance;
    }

    // Create the item
    const dataToCreate = { ...dbFields };

    // If FIFO is enabled and initial stock is provided, we'll create the stock via a movement 
    // to ensure a batch is created. We set column to 0 initially.
    const initialStock = parseFloat(dbFields.current_stock || 0);
    if (dbFields.fifo_enabled && initialStock > 0) {
      dataToCreate.current_stock = 0;
    }

    const item = await Item.create(dataToCreate, { transaction });

    // Handle initial stock for FIFO items
    if (dbFields.fifo_enabled && initialStock > 0) {
      await createStockMovement({
        item_id: item.item_id,
        quantity: initialStock,
        movement_type: 'adjustment',
        notes: 'Initial stock entry from item creation',
        reference_type: 'MANUAL'
      }, userId, transaction);
    }

    // For active products, save wizard data to relational tables
    if (itemData.status === 'active' && itemData.category === 'product') {
      const wizardData = {
        labor_cost,
        overhead_cost,
        additional_packaging_cost,
        ingredients,
        packaging_items,
        nutritional_info,
        allergens,
        may_contain_allergens,
        physical_properties,
        shelf_life,
        packaging_info,
        quality_control,
        regulatory_compliance
      };

      await saveRelatedWizardData(item.item_id, wizardData, transaction);
    }

    await transaction.commit();

    // ASYNC: Generate Embedding
    syncItemEmbedding(item).catch(err =>
      console.error(`Embedding sync failed for new item ${item.item_id}:`, err.message)
    );

    // Fetch and return complete item with all associations (outside transaction)
    const completeItem = await getItemById(item.item_id);
    return completeItem;

  } catch (error) {
    // Only rollback if transaction is still active
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
};

export const updateItem = async (itemId, itemData, userId = null) => {
  // Get models and sequelize from tenant context  
  const Item = dbStore.get('Item');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();

  try {
    const item = await Item.findByPk(itemId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!item) {
      const error = new Error('Item not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if SKU code is being changed and if it already exists (exclude drafts)
    if (itemData.sku_code && itemData.sku_code !== item.sku_code) {
      const existingItem = await Item.findOne({
        where: {
          sku_code: itemData.sku_code,
          status: { [Op.notIn]: ['draft', 'inactive'] }, // Exclude drafts AND soft-deleted items
          item_id: { [Op.ne]: itemId }
        }
      });

      if (existingItem) {
        const error = new Error('Item with this SKU code already exists');
        error.statusCode = 409;
        throw error;
      }
    }

    // Separate wizard-specific fields from database fields
    const {
      labor_cost,
      overhead_cost,
      additional_packaging_cost,
      ingredients,
      packaging_items,
      nutritional_info,
      allergens,
      may_contain_allergens,
      physical_properties,
      shelf_life,
      packaging_info,
      quality_control,
      regulatory_compliance,
      ...dbFields
    } = itemData;

    // For draft products, store wizard data in wizard_metadata
    if (itemData.status === 'draft' || item.status === 'draft') {
      dbFields.wizard_metadata = {
        ...(item.wizard_metadata || {}),
        labor_cost,
        overhead_cost,
        additional_packaging_cost,
        ingredients,
        packaging_items,
        nutritional_info,
        allergens,
        may_contain_allergens,
        physical_properties,
        shelf_life,
        packaging_info,
        quality_control,
        regulatory_compliance
      };
    }

    // Auto-calculate thresholds if max_capacity is being updated (enforced server-side)
    if (dbFields.max_capacity !== undefined) {
      const thresholds = await calculateThresholds(dbFields.max_capacity);
      dbFields.min_threshold = thresholds.min_threshold;
      dbFields.purchase_allowance = thresholds.purchase_allowance;
    }

    // Update item basic fields
    dbFields.updated_by = userId;

    // If FIFO is enabled and current_stock is being manually updated via the item form,
    // we should create a stock movement and batch if the value has changed.
    const newStockValue = dbFields.current_stock !== undefined ? parseFloat(dbFields.current_stock || 0) : null;
    const oldStockValue = parseFloat(item.current_stock || 0);

    if (newStockValue !== null && newStockValue !== oldStockValue && item.fifo_enabled) {
      const delta = newStockValue - oldStockValue;
      // We'll update the item WITHOUT the current_stock first, then let the movement handle the column update
      delete dbFields.current_stock;

      await item.update(dbFields, { transaction });

      await createStockMovement({
        item_id: itemId,
        quantity: Math.abs(delta),
        movement_type: delta > 0 ? 'adjustment' : 'calculated_loss', // adjustment for up, loss for down
        notes: `Manual stock adjustment from item update form (Old: ${oldStockValue}, New: ${newStockValue})`,
        reference_type: 'MANUAL'
      }, userId, transaction);
    } else {
      await item.update(dbFields, { transaction });
    }

    // For active products, save wizard data to relational tables
    if (item.status === 'active' && item.category === 'product') {
      const wizardData = {
        labor_cost,
        overhead_cost,
        additional_packaging_cost,
        ingredients,
        packaging_items,
        nutritional_info,
        allergens,
        may_contain_allergens,
        physical_properties,
        shelf_life,
        packaging_info,
        quality_control,
        regulatory_compliance
      };

      await saveRelatedWizardData(itemId, wizardData, transaction);
    }

    await transaction.commit();

    // Return complete item with all associations
    return await getItemById(itemId);

  } catch (error) {
    // Only rollback if transaction is still active
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
};

export const deleteItem = async (itemId, userId) => {
  // Get models from tenant context
  const Item = dbStore.get('Item');
  const ProductComposition = dbStore.get('ProductComposition');
  const POLineItem = dbStore.get('POLineItem');
  const PurchaseOrder = dbStore.get('PurchaseOrder');
  const JOIngredient = dbStore.get('JOIngredient');
  const JobOrder = dbStore.get('JobOrder');

  const item = await Item.findByPk(itemId);

  if (!item) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  // Comprehensive pre-delete safety checks
  const errors = [];

  // Check 1: Item used as ingredient in ACTIVE products only
  // (Soft-deleted products should not block ingredient deletion)
  const productCompositions = await ProductComposition.findAll({
    where: { ingredient_id: itemId },
    include: [{
      model: Item,
      as: 'product',
      attributes: ['name', 'sku_code', 'status'],
      where: { status: 'active' } // Only check active products, not drafts or deleted
    }]
  });

  if (productCompositions.length > 0) {
    const productNames = productCompositions.map(pc =>
      `${pc.product.name} (${pc.product.sku_code})`
    ).join(', ');
    errors.push(`Used as ingredient in ${productCompositions.length} active product(s): ${productNames}`);
  }

  // Check 2: Item in ANY Purchase Orders
  const poLineItems = await POLineItem.findAll({
    where: { item_id: itemId },
    include: [{
      model: PurchaseOrder,
      as: 'purchaseOrder',
      attributes: ['po_number', 'status'],
      where: { archived_at: null } // Only check non-archived POs
    }]
  });

  if (poLineItems.length > 0) {
    const poNumbers = poLineItems.map(po =>
      `${po.purchaseOrder.po_number} (${po.purchaseOrder.status})`
    ).join(', ');
    errors.push(`Referenced in ${poLineItems.length} purchase order(s): ${poNumbers}`);
  }

  // Check 3: Item in ANY Job Orders
  const joIngredients = await JOIngredient.findAll({
    where: { item_id: itemId },
    include: [{
      model: JobOrder,
      as: 'jobOrder',
      attributes: ['jo_number', 'status'],
      where: { archived_at: null } // Only check non-archived JOs
    }]
  });

  if (joIngredients.length > 0) {
    const joNumbers = joIngredients.map(jo =>
      `${jo.jobOrder.jo_number} (${jo.jobOrder.status})`
    ).join(', ');
    errors.push(`Referenced in ${joIngredients.length} job order(s): ${joNumbers}`);
  }

  // If any errors, throw with detailed message
  if (errors.length > 0) {
    const error = new Error(`Cannot delete item "${item.name}". Reasons:\n- ${errors.join('\n- ')}`);
    error.statusCode = 400;
    error.details = errors;
    throw error;
  }

  // Soft delete with audit trail
  await item.update({
    status: 'inactive',
    deleted_by: userId,
    deleted_at: new Date()
  });

  return true;
};

/**
 * Extracts wizard data and saves to related tables
 * @param {number} itemId - The item ID
 * @param {object} wizardData - Wizard metadata object
 * @param {Transaction} transaction - Sequelize transaction
 */
const saveRelatedWizardData = async (itemId, wizardData, transaction) => {
  // Get models from tenant context
  const ItemNutrition = dbStore.get('ItemNutrition');
  const ItemAllergen = dbStore.get('ItemAllergen');
  const ItemPhysicalProperties = dbStore.get('ItemPhysicalProperties');
  const ItemShelfLife = dbStore.get('ItemShelfLife');
  const ItemPackaging = dbStore.get('ItemPackaging');
  const ItemQualityControl = dbStore.get('ItemQualityControl');
  const ItemRegulatoryCompliance = dbStore.get('ItemRegulatoryCompliance');
  const ItemCostBreakdown = dbStore.get('ItemCostBreakdown');
  const ProductComposition = dbStore.get('ProductComposition');

  const promises = [];

  // 1. Nutritional Info
  if (wizardData.nutritional_info && Object.keys(wizardData.nutritional_info).length > 0) {
    promises.push(
      ItemNutrition.upsert({
        item_id: itemId,
        ...wizardData.nutritional_info
      }, { transaction })
    );
  }

  // 2. Allergens - convert arrays to rows
  if ((wizardData.allergens && wizardData.allergens.length > 0) ||
    (wizardData.may_contain_allergens && wizardData.may_contain_allergens.length > 0)) {
    // Delete existing allergens for this item
    promises.push(
      ItemAllergen.destroy({ where: { item_id: itemId }, transaction })
    );

    // Collect all allergen rows
    const allergenRows = [];

    // Main allergens
    if (wizardData.allergens && wizardData.allergens.length > 0) {
      allergenRows.push(...wizardData.allergens.map(allergen => ({
        item_id: itemId,
        allergen_name: allergen,
        is_cross_contamination: false
      })));
    }

    // May contain allergens (cross-contamination)
    if (wizardData.may_contain_allergens && wizardData.may_contain_allergens.length > 0) {
      allergenRows.push(...wizardData.may_contain_allergens.map(allergen => ({
        item_id: itemId,
        allergen_name: allergen,
        is_cross_contamination: true
      })));
    }

    if (allergenRows.length > 0) {
      promises.push(
        ItemAllergen.bulkCreate(allergenRows, { transaction })
      );
    }
  }

  // 3. Physical Properties
  if (wizardData.physical_properties && Object.keys(wizardData.physical_properties).length > 0) {
    promises.push(
      ItemPhysicalProperties.upsert({
        item_id: itemId,
        ...wizardData.physical_properties
      }, { transaction })
    );
  }

  // 4. Shelf Life
  if (wizardData.shelf_life && Object.keys(wizardData.shelf_life).length > 0) {
    promises.push(
      ItemShelfLife.upsert({
        item_id: itemId,
        ...wizardData.shelf_life
      }, { transaction })
    );
  }

  // 5. Packaging Info
  if (wizardData.packaging_info && Object.keys(wizardData.packaging_info).length > 0) {
    promises.push(
      ItemPackaging.upsert({
        item_id: itemId,
        ...wizardData.packaging_info
      }, { transaction })
    );
  }

  // 6. Quality Control
  if (wizardData.quality_control && Object.keys(wizardData.quality_control).length > 0) {
    promises.push(
      ItemQualityControl.upsert({
        item_id: itemId,
        ...wizardData.quality_control
      }, { transaction })
    );
  }

  // 7. Regulatory Compliance
  if (wizardData.regulatory_compliance && Object.keys(wizardData.regulatory_compliance).length > 0) {
    promises.push(
      ItemRegulatoryCompliance.upsert({
        item_id: itemId,
        ...wizardData.regulatory_compliance
      }, { transaction })
    );
  }

  // 8. Cost Breakdown
  const hasCostData = wizardData.labor_cost || wizardData.overhead_cost || wizardData.additional_packaging_cost;
  if (hasCostData) {
    promises.push(
      ItemCostBreakdown.upsert({
        item_id: itemId,
        labor_cost: wizardData.labor_cost || 0,
        overhead_cost: wizardData.overhead_cost || 0,
        additional_packaging_cost: wizardData.additional_packaging_cost || 0
      }, { transaction })
    );
  }

  // 9. Ingredients (ProductComposition with type='ingredient')
  if (wizardData.ingredients && wizardData.ingredients.length > 0) {
    // Extract ingredient IDs for validation
    const ingredientIds = wizardData.ingredients
      .filter(ing => ing.item_id)
      .map(ing => parseInt(ing.item_id, 10));

    // Validate composition for circular dependencies and depth limits
    if (ingredientIds.length > 0) {
      const validation = await validateComposition(itemId, ingredientIds);

      if (!validation.valid) {
        const error = new Error('Invalid product composition');
        error.statusCode = 400;
        error.details = validation.errors.map(e => e.message);
        throw error;
      }

      // Update item nesting metadata
      // Get models from tenant context (Item is locally bound above in createItem/updateItem if passed, but better to get fresh)
      const Item = dbStore.get('Item');
      await Item.update({
        nesting_level: validation.nestingLevel,
        max_child_depth: Math.max(0, validation.nestingLevel - 1)
      }, { where: { item_id: itemId }, transaction });
    }

    // Delete existing ingredient compositions
    promises.push(
      ProductComposition.destroy({
        where: { product_id: itemId, composition_type: 'ingredient' },
        transaction
      })
    );

    // Determine is_subproduct for each ingredient
    const Item = dbStore.get('Item');
    const ingredientItems = await Item.findAll({
      where: { item_id: ingredientIds },
      attributes: ['item_id', 'category']
    });
    const ingredientCategoryMap = new Map(
      ingredientItems.map(i => [i.item_id, i.category])
    );

    const ingredientRows = wizardData.ingredients
      .filter(ing => ing.item_id && ing.quantity)
      .map(ing => ({
        product_id: itemId,
        ingredient_id: ing.item_id,
        composition_type: 'ingredient',
        quantity_required: ing.quantity,
        unit_of_measure: ing.unit_of_measure || null,
        is_subproduct: ingredientCategoryMap.get(parseInt(ing.item_id, 10)) === 'product'
      }));

    if (ingredientRows.length > 0) {
      promises.push(
        ProductComposition.bulkCreate(ingredientRows, { transaction })
      );

      // Invalidate dependency graph cache since composition changed
      promises.push(invalidateDependencyGraphCache());
    }
  }

  // 10. Packaging Items (ProductComposition with type='packaging')
  if (wizardData.packaging_items && wizardData.packaging_items.length > 0) {
    // Delete existing packaging compositions
    promises.push(
      ProductComposition.destroy({
        where: { product_id: itemId, composition_type: 'packaging' },
        transaction
      })
    );

    const packagingRows = wizardData.packaging_items
      .filter(pkg => pkg.item_id && pkg.quantity)
      .map(pkg => ({
        product_id: itemId,
        ingredient_id: pkg.item_id, // Reusing same column
        composition_type: 'packaging',
        quantity_required: pkg.quantity,
        unit_of_measure: pkg.unit_of_measure || null
      }));

    if (packagingRows.length > 0) {
      promises.push(
        ProductComposition.bulkCreate(packagingRows, { transaction })
      );
    }
  }

  await Promise.all(promises);
};

export const finalizeItem = async (itemId, itemData = {}, userId = null) => {
  // Get models and sequelize from tenant context
  const Item = dbStore.get('Item');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();

  try {
    const item = await Item.findByPk(itemId, { transaction });

    if (!item) {
      const error = new Error('Item not found');
      error.statusCode = 404;
      throw error;
    }

    if (item.status !== 'draft') {
      const error = new Error('Only draft items can be finalized');
      error.statusCode = 400;
      throw error;
    }

    // Extract wizard_metadata if exists
    const wizardData = item.wizard_metadata || {};

    // Merge priority: wizardData < existing item data < new itemData
    // This ensures new data from the wizard takes precedence
    const mergedData = {
      ...wizardData,
      sku_code: item.sku_code,
      name: item.name,
      category: item.category,
      description: item.description,
      product_folder: item.product_folder,
      max_capacity: item.max_capacity,
      min_threshold: item.min_threshold,
      purchase_allowance: item.purchase_allowance,
      unit_of_measure: item.unit_of_measure,
      cost_per_unit: item.cost_per_unit,
      current_stock: item.current_stock,
      fifo_enabled: item.fifo_enabled,
      batch_size: item.batch_size,
      yield_percentage: item.yield_percentage,
      processing_loss: item.processing_loss,
      production_notes: item.production_notes,
      ...itemData
    };

    // Validate required fields from merged data
    if (!mergedData.sku_code) {
      const error = new Error('SKU code is required to finalize item');
      error.statusCode = 422;
      throw error;
    }

    if (!mergedData.category) {
      const error = new Error('Category is required to finalize item');
      error.statusCode = 422;
      throw error;
    }

    if (!mergedData.max_capacity) {
      const error = new Error('Max capacity is required to finalize item');
      error.statusCode = 422;
      throw error;
    }

    if (!mergedData.unit_of_measure) {
      const error = new Error('Unit of measure is required to finalize item');
      error.statusCode = 422;
      throw error;
    }

    // Check SKU uniqueness among active items
    const existingItem = await Item.findOne({
      where: {
        sku_code: mergedData.sku_code,
        status: { [Op.notIn]: ['draft', 'inactive'] }, // Exclude drafts AND soft-deleted items
        item_id: { [Op.ne]: itemId }
      },
      transaction
    });

    if (existingItem) {
      const error = new Error('Item with this SKU code already exists');
      error.statusCode = 409;
      throw error;
    }

    // SAVE ALL RELATED DATA FIRST (before clearing wizard_metadata)
    await saveRelatedWizardData(itemId, wizardData, transaction);

    // Remove wizard-specific fields from updateData - they're now in relational tables
    const {
      labor_cost,
      overhead_cost,
      additional_packaging_cost,
      ingredients,
      packaging_items,
      nutritional_info,
      allergens,
      may_contain_allergens,
      physical_properties,
      shelf_life,
      packaging_info,
      quality_control,
      regulatory_compliance,
      ...itemFields
    } = mergedData;

    // Prepare update data - only item table fields
    const updateData = {
      ...itemFields,
      status: 'active',
      wizard_metadata: null,  // Clear wizard metadata after finalization
      updated_by: userId
    };

    // Update the item
    await item.update(updateData, { transaction });

    await transaction.commit();

    // ASYNC: Update Embedding
    syncItemEmbedding(item).catch(err =>
      console.error(`Embedding sync failed for item ${item.item_id}:`, err.message)
    );

    // Reload item with all associations
    const ItemNutrition = dbStore.get('ItemNutrition');
    const ItemAllergen = dbStore.get('ItemAllergen');
    const ItemPhysicalProperties = dbStore.get('ItemPhysicalProperties');
    const ItemShelfLife = dbStore.get('ItemShelfLife');
    const ItemPackaging = dbStore.get('ItemPackaging');
    const ItemQualityControl = dbStore.get('ItemQualityControl');
    const ItemRegulatoryCompliance = dbStore.get('ItemRegulatoryCompliance');
    const ItemCostBreakdown = dbStore.get('ItemCostBreakdown');
    const FIFOBatch = dbStore.get('FIFOBatch');
    const ProductComposition = dbStore.get('ProductComposition');

    const finalizedItem = await Item.findByPk(itemId, {
      include: [
        { model: ItemNutrition, as: 'nutrition', required: false },
        { model: ItemAllergen, as: 'allergens', required: false },
        { model: ItemPhysicalProperties, as: 'physicalProperties', required: false },
        { model: ItemShelfLife, as: 'shelfLife', required: false },
        { model: ItemPackaging, as: 'packaging', required: false },
        { model: ItemQualityControl, as: 'qualityControl', required: false },
        { model: ItemRegulatoryCompliance, as: 'regulatoryCompliance', required: false },
        { model: ItemCostBreakdown, as: 'costBreakdown', required: false },
        {
          model: FIFOBatch,
          as: 'fifoBatches',
          required: false,
          include: [{ model: Item, as: 'item', attributes: ['unit_of_measure'] }] // Optional: ensure unit is available if needed
        },
        {
          model: ProductComposition,
          as: 'productCompositions',
          required: false,
          include: [{ model: Item, as: 'ingredient', required: false }]
        }
      ]
    });

    return finalizedItem;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const getItemStockHistory = async (itemId, queryParams) => {
  // Get models from tenant context
  const StockMovement = dbStore.get('StockMovement');
  const User = dbStore.get('User');

  const {
    startDate,
    endDate,
    movementType,
    limit = 50
  } = queryParams;

  const where = { item_id: itemId };

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) {
      where.timestamp[Op.gte] = new Date(startDate);
    }
    if (endDate) {
      where.timestamp[Op.lte] = new Date(endDate);
    }
  }

  if (movementType) {
    where.movement_type = movementType;
  }

  const movements = await StockMovement.findAll({
    where,
    limit: parseInt(limit),
    order: [['timestamp', 'DESC']],
    include: [
      {
        model: User,
        as: 'userResponsible',
        required: false,
        attributes: ['username']
      }
    ]
  });

  return movements.map(movement => {
    const m = movement.toJSON();
    return {
      movement_id: m.movement_id,
      item_id: m.item_id,
      movement_type: m.movement_type,
      quantity: m.quantity,
      reference_id: m.reference_id,
      reference_type: m.reference_type,
      user_responsible: m.userResponsible?.username || null,
      timestamp: m.timestamp
    };
  });
};

export const getItemBatches = async (itemId) => {
  // Get models from tenant context
  const FIFOBatch = dbStore.get('FIFOBatch');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  const batches = await FIFOBatch.findAll({
    where: {
      item_id: itemId,
      [Op.and]: [
        sequelize.where(
          sequelize.col('quantity'),
          Op.gt,
          sequelize.col('quantity_consumed')
        )
      ]
    },
    order: [['received_date', 'ASC']]
  });

  return batches;
};

export const getItemMovements = async (itemId) => {
  // Get models from tenant context
  const StockMovement = dbStore.get('StockMovement');

  const movements = await StockMovement.findAll({
    where: { item_id: itemId },
    order: [['timestamp', 'DESC']],
    limit: 50
  });

  return movements;
};

/**
 * Get item supplier coverage statistics
 * Returns items grouped by whether they have suppliers assigned
 * Only includes purchasable items (raw_material, packaging, supplies)
 * @returns {Promise<object>} Object with items_with_supplier and items_without_supplier arrays
 */
export const getItemSupplierCoverage = async () => {
  try {
    // Get active models from store - FIX FOR ReferenceError
    const Item = dbStore.get('Item');
    const Supplier = dbStore.get('Supplier');
    const SupplierItem = dbStore.get('SupplierItem');

    // Get all active purchasable items (raw_material, packaging, supplies)
    const purchasableCategories = ['raw_material', 'packaging', 'supplies'];

    const allItems = await Item.findAll({
      where: {
        status: 'active',
        category: { [Op.in]: purchasableCategories }
      },
      attributes: ['item_id', 'name', 'sku_code', 'category', 'current_stock', 'min_threshold', 'unit_of_measure'],
      order: [['name', 'ASC']]
    });

    // Get all supplier-item relationships
    const supplierItems = await SupplierItem.findAll({
      include: [{
        model: Supplier,
        as: 'supplier',
        attributes: ['supplier_id', 'name', 'status'],
        where: { status: 'active' } // Only count active suppliers
      }],
      attributes: ['item_id', 'supplier_id', 'moq', 'price_per_unit']
    });

    // Create a map of item_id -> supplier count
    const itemSupplierMap = new Map();
    supplierItems.forEach(si => {
      try {
        const itemId = si.item_id;
        if (!itemId) return; // Skip records without item_id

        if (!itemSupplierMap.has(itemId)) {
          itemSupplierMap.set(itemId, []);
        }

        const supplierName = (si.supplier && si.supplier.name)
          ? si.supplier.name
          : 'Unknown Supplier';

        itemSupplierMap.get(itemId).push({
          supplier_id: si.supplier_id,
          supplier_name: supplierName,
          moq: si.moq || 0,
          price_per_unit: si.price_per_unit || 0
        });
      } catch (err) {
        console.error(`Error processing supplier item ${si.supplier_item_id || 'unknown'}:`, err.message);
      }
    });

    // Separate items into two arrays
    const itemsWithSupplier = [];
    const itemsWithoutSupplier = [];

    allItems.forEach(item => {
      const itemData = {
        item_id: item.item_id,
        id: item.item_id, // Frontend compatibility
        name: item.name,
        sku_code: item.sku_code,
        category: item.category,
        current_stock: item.current_stock,
        min_threshold: item.min_threshold,
        unit_of_measure: item.unit_of_measure
      };

      if (itemSupplierMap.has(item.item_id)) {
        itemData.suppliers = itemSupplierMap.get(item.item_id);
        itemData.supplier_count = itemData.suppliers.length;
        itemsWithSupplier.push(itemData);
      } else {
        itemData.suppliers = [];
        itemData.supplier_count = 0;
        itemsWithoutSupplier.push(itemData);
      }
    });

    return {
      items_with_supplier: itemsWithSupplier,
      items_without_supplier: itemsWithoutSupplier,
      summary: {
        total_purchasable_items: allItems.length,
        items_with_supplier_count: itemsWithSupplier.length,
        items_without_supplier_count: itemsWithoutSupplier.length,
        coverage_percent: allItems.length > 0
          ? Math.round((itemsWithSupplier.length / allItems.length) * 100)
          : 100
      }
    };
  } catch (error) {
    throw error;
  }
};
