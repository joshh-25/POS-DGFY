import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { createStockMovement } from './stockMovementService.js';
import { convertQuantity, areCompatible, normalizeUom, getUomLabel } from '../utils/uomConverter.js';

export const getJobOrders = async (queryParams) => {
  const JobOrder = dbStore.get('JobOrder');
  const Item = dbStore.get('Item');
  const User = dbStore.get('User');

  const { page = 1, limit = 20, status, archived = 'false' } = queryParams;
  const offset = (page - 1) * limit;
  const where = {};

  // Filter archived JOs
  if (archived === 'true') {
    where.archived_at = { [Op.not]: null };
  } else {
    where.archived_at = null;
  }

  if (status) where.status = status;

  const { count, rows } = await JobOrder.findAndCountAll({
    where,
    include: [
      { model: Item, as: 'product', attributes: ['name', 'sku_code'] },
      { model: User, as: 'responsibleUser', attributes: ['username'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['created_date', 'DESC']]
  });

  return {
    job_orders: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  };
};

export const getJobOrderById = async (joId) => {
  const JobOrder = dbStore.get('JobOrder');
  const Item = dbStore.get('Item');
  const User = dbStore.get('User');
  const JOIngredient = dbStore.get('JOIngredient');
  const FIFOBatch = dbStore.get('FIFOBatch');
  const StockMovement = dbStore.get('StockMovement');
  const BatchTransaction = dbStore.get('BatchTransaction');

  const jo = await JobOrder.findByPk(joId, {
    include: [
      { model: Item, as: 'product' },
      { model: User, as: 'responsibleUser', attributes: ['username'] },
      {
        model: JOIngredient,
        as: 'ingredients',
        include: [
          { model: Item, as: 'item' },
          { model: FIFOBatch, as: 'batch' }
        ]
      }
    ]
  });

  if (!jo) {
    const error = new Error('Job order not found');
    error.statusCode = 404;
    throw error;
  }

  if (jo.status === 'completed') {
    const movements = await StockMovement.findAll({
      where: {
        reference_id: jo.jo_number,
        reference_type: 'JO',
        movement_type: 'production_consumption'
      },
      include: [{
        model: BatchTransaction,
        as: 'batchTransactions',
        include: [{ model: FIFOBatch, as: 'batch' }]
      }]
    });

    const movementsByItem = {};
    movements.forEach(m => {
      movementsByItem[m.item_id] = m.batchTransactions || [];
    });

    jo.ingredients.forEach(ing => {
      ing.dataValues.batchTransactions = movementsByItem[ing.item_id] || [];
    });
  }

  return jo;
};

export const createJobOrder = async (joData, userId) => {
  const JobOrder = dbStore.get('JobOrder');
  const JOIngredient = dbStore.get('JOIngredient');
  const Item = dbStore.get('Item');

  const { ingredients, ...joMainData } = joData;

  // Only generate JO number if not a draft
  const isDraft = joData.status === 'draft' || !joData.status;
  const joNumber = isDraft ? null : `JO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  // NEW: Validate stock for non-draft JOs with UOM conversion support
  if (!isDraft) {
    if (!ingredients || ingredients.length === 0) {
      const error = new Error('Cannot create job order: Product must have a recipe (ingredients) defined.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (!isDraft && ingredients && ingredients.length > 0) {
    const insufficientIngredients = [];

    for (const ing of ingredients) {
      // Fetch current stock from database
      const item = await Item.findByPk(ing.item_id, {
        attributes: ['item_id', 'name', 'current_stock', 'unit_of_measure']
      });

      if (!item) {
        const error = new Error(`Ingredient not found: ${ing.item_id}`);
        error.statusCode = 404;
        throw error;
      }

      const currentStock = parseFloat(item.current_stock);
      const requiredQty = parseFloat(ing.quantity_required);
      const ingredientUom = normalizeUom(item.unit_of_measure);
      const recipeUom = normalizeUom(ing.unit_of_measure || item.unit_of_measure);

      // Convert required quantity to ingredient's UOM if compatible
      let convertedRequiredQty = requiredQty;
      let wasConverted = false;

      if (areCompatible(recipeUom, ingredientUom) && recipeUom !== ingredientUom) {
        const converted = convertQuantity(requiredQty, recipeUom, ingredientUom);
        if (converted !== null) {
          convertedRequiredQty = converted;
          wasConverted = true;
        }
      } else if (recipeUom !== ingredientUom) {
        // New Validation
        const error = new Error(`Incompatible units for ingredient ${item.name}: Cannot convert ${recipeUom} to ${ingredientUom}`);
        error.statusCode = 400;
        throw error;
      }

      if (currentStock < convertedRequiredQty) {
        insufficientIngredients.push({
          item_name: item.name,
          required: convertedRequiredQty,
          required_original: wasConverted ? requiredQty : null,
          required_original_unit: wasConverted ? recipeUom : null,
          available: currentStock,
          unit: ingredientUom,
          shortage: convertedRequiredQty - currentStock,
          converted: wasConverted
        });
      }
    }

    // If any ingredients have insufficient stock, reject the creation
    if (insufficientIngredients.length > 0) {
      const error = new Error('Cannot create job order: Insufficient stock for ingredients');
      error.statusCode = 400;
      error.insufficientIngredients = insufficientIngredients;
      throw error;
    }
  }

  // Wrap in transaction for atomicity
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  return await sequelize.transaction(async (t) => {
    const jo = await JobOrder.create({
      ...joMainData,
      jo_number: joNumber,
      responsible_user: userId,
      status: isDraft ? 'draft' : 'in_progress'
    }, { transaction: t });

    if (ingredients && ingredients.length > 0) {
      await Promise.all(
        ingredients.map(ing => JOIngredient.create({
          jo_id: jo.jo_id,
          item_id: ing.item_id,
          quantity_required: ing.quantity_required,
          unit_of_measure: ing.unit_of_measure || null, // Store recipe UOM
          quantity_consumed: ing.quantity_consumed || null,
          stock_before: ing.stock_before || null,
          stock_after: ing.stock_after || null
        }, { transaction: t }))
      );
    }

    return jo;
  });
};

export const finalizeJobOrder = async (joId, userId) => {
  const JobOrder = dbStore.get('JobOrder');
  const Item = dbStore.get('Item');
  const JOIngredient = dbStore.get('JOIngredient');

  const jo = await JobOrder.findByPk(joId, {
    include: [
      { model: Item, as: 'product' },
      { model: JOIngredient, as: 'ingredients' }
    ]
  });

  if (!jo) {
    const error = new Error('Job order not found');
    error.statusCode = 404;
    throw error;
  }

  if (jo.status !== 'draft') {
    const error = new Error('Only draft job orders can be finalized');
    error.statusCode = 400;
    throw error;
  }

  // Validate required fields
  if (!jo.product_id) {
    const error = new Error('Product is required to finalize job order');
    error.statusCode = 422;
    throw error;
  }

  if (!jo.quantity_to_produce || jo.quantity_to_produce <= 0) {
    const error = new Error('Quantity to produce must be greater than 0');
    error.statusCode = 422;
    throw error;
  }

  // NEW: Validate stock before finalizing draft
  const insufficientIngredients = [];

  // Reload ingredients with item details
  const joWithIngredients = await JobOrder.findByPk(joId, {
    include: [
      {
        model: JOIngredient,
        as: 'ingredients',
        include: [{
          model: Item,
          as: 'item',
          attributes: ['item_id', 'name', 'current_stock', 'unit_of_measure']
        }]
      }
    ]
  });

  for (const ingredient of joWithIngredients.ingredients) {
    const item = ingredient.item;
    const currentStock = parseFloat(item.current_stock);
    const requiredQty = parseFloat(ingredient.quantity_required);
    const ingredientUom = normalizeUom(item.unit_of_measure);
    const recipeUom = normalizeUom(ingredient.unit_of_measure || item.unit_of_measure);

    // Convert required quantity to ingredient's UOM if compatible
    let convertedRequiredQty = requiredQty;
    let wasConverted = false;

    if (areCompatible(recipeUom, ingredientUom) && recipeUom !== ingredientUom) {
      const converted = convertQuantity(requiredQty, recipeUom, ingredientUom);
      if (converted !== null) {
        convertedRequiredQty = converted;
        wasConverted = true;
      }
    } else if (recipeUom !== ingredientUom) {
      throw new Error(`Incompatible units for ingredient ${item.name}: Cannot convert ${recipeUom} to ${ingredientUom}`);
    }

    if (currentStock < convertedRequiredQty) {
      insufficientIngredients.push({
        item_name: item.name,
        required: convertedRequiredQty,
        required_original: wasConverted ? requiredQty : null,
        required_original_unit: wasConverted ? recipeUom : null,
        available: currentStock,
        unit: ingredientUom,
        shortage: convertedRequiredQty - currentStock,
        converted: wasConverted
      });
    }
  }

  if (insufficientIngredients.length > 0) {
    const error = new Error('Cannot finalize job order: Insufficient stock for ingredients');
    error.statusCode = 400;
    error.insufficientIngredients = insufficientIngredients;
    throw error;
  }

  // Generate JO number
  const joNumber = `JO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  // Update status to in_progress and add JO number
  await jo.update({
    status: 'in_progress',
    jo_number: joNumber
  });

  return jo;
};

export const completeJobOrder = async (joId, userId, expiryDateOverride = null, notes = null, quantityProduced = null, qualityCheck = null) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  // Start transaction
  return await sequelize.transaction(async (t) => {
    try {
      const JobOrder = dbStore.get('JobOrder');
      const Item = dbStore.get('Item');
      const JOIngredient = dbStore.get('JOIngredient');
      const FIFOBatch = dbStore.get('FIFOBatch');

      console.log(`[JO Completion] Starting completion for JO #${joId} by User ${userId}`);

      const jo = await JobOrder.findByPk(joId, {
        include: [
          { model: Item, as: 'product' },
          {
            model: JOIngredient,
            as: 'ingredients',
            include: [{ model: Item, as: 'item' }]
          }
        ],
        transaction: t // Lock row or at least participate in transaction
      });

      if (!jo) {
        console.error(`[JO Completion] Job Order ${joId} not found`);
        const error = new Error('Job order not found');
        error.statusCode = 404;
        throw error;
      }

      if (jo.status === 'completed') {
        console.error(`[JO Completion] Job Order ${joId} already completed`);
        const error = new Error('Job order already completed');
        error.statusCode = 400;
        throw error;
      }

      if (jo.status === 'draft') {
        console.error(`[JO Completion] Job Order ${joId} is still a draft`);
        const error = new Error('Cannot complete a draft job order. Please finalize it first.');
        error.statusCode = 400;
        throw error;
      }

      // Determine quantity to process in this transaction
      const currentQuantityProduced = parseFloat(jo.quantity_produced || 0);
      const totalQuantityToProduce = parseFloat(jo.quantity_to_produce);
      const remainingQuantity = totalQuantityToProduce - currentQuantityProduced;

      // If quantityProduced is not provided, assume full remaining quantity (legacy behavior)
      const qtyToProcess = quantityProduced ? parseFloat(quantityProduced) : remainingQuantity;

      console.log(`[JO Completion] Processing Qty: ${qtyToProcess}, Remaining: ${remainingQuantity}`);

      // Validation
      if (qtyToProcess <= 0) {
        const error = new Error('Quantity to produce must be greater than 0');
        error.statusCode = 400;
        throw error;
      }

      // Final completion = total produced (after this batch) meets or exceeds the target.
      // Covers exact completion, float-imprecise completion, and over-production.
      // Over-production is allowed: users may record higher-than-target yields.
      const newQuantityProducedPreview = currentQuantityProduced + qtyToProcess;
      const isFinalCompletion = newQuantityProducedPreview >= totalQuantityToProduce - 0.001;

      // Calculate ratio for ingredient consumption
      // Avoid division by zero if totalQuantityToProduce is somehow 0 (should correspond to validation in create)
      const consumptionRatio = totalQuantityToProduce > 0 ? (qtyToProcess / totalQuantityToProduce) : 1;

      // Process ingredients (FIFO consumption) with UOM conversion support
      for (const ingredient of jo.ingredients) {
        const item = ingredient.item;
        const totalRequired = parseFloat(ingredient.quantity_required);
        const ingredientUom = normalizeUom(item.unit_of_measure);
        // FIRST PRIORITY: Use stored recipe UOM from JOIngredient table
        // SECOND PRIORITY: Use passed unit_of_measure (rare case)
        // FALLBACK: Use item's stock UOM
        const recipeUom = normalizeUom(ingredient.unit_of_measure || ingredient.item?.unit_of_measure);

        console.log(`[JO Completion] Processing Ingredient: ${item.name} (ID: ${item.item_id}) -- RecipeUOM: ${recipeUom}, StockUOM: ${ingredientUom}`);

        // Convert required quantity to ingredient's UOM if compatible
        let convertedTotalRequired = totalRequired;
        if (areCompatible(recipeUom, ingredientUom) && recipeUom !== ingredientUom) {
          const converted = convertQuantity(totalRequired, recipeUom, ingredientUom);
          if (converted !== null) {
            convertedTotalRequired = converted;
            console.log(`[JO Completion] Converted ${totalRequired} ${recipeUom} -> ${converted} ${ingredientUom}`);
          } else {
            console.warn(`[JO Completion] Conversion failed despite compatibility check for ${item.name}`);
          }
        } else if (recipeUom !== ingredientUom) {
          console.error(`[JO Completion] Incompatible units for ${item.name}: ${recipeUom} vs ${ingredientUom}`);
          throw new Error(`Incompatible units for ingredient ${item.name}: Cannot convert ${recipeUom} to ${ingredientUom}`);
        }

        // Also convert previously consumed amount if stored in different UOM
        const previouslyConsumed = parseFloat(ingredient.quantity_consumed || 0);

        // Calculate quantity to consume for this chunk (now in ingredient's UOM)
        let quantityToConsume;
        if (isFinalCompletion && qtyToProcess <= remainingQuantity + 0.001) {
          // Exact/near-exact completion: consume the precise remaining requirement
          // to avoid floating-point accumulation across partial batches.
          quantityToConsume = convertedTotalRequired - previouslyConsumed;
        } else {
          // Partial completion OR over-production: consume proportionally.
          // consumptionRatio = qtyToProcess / totalQuantityToProduce.
          // For over-production ratio > 1.0 — correct: more output = more ingredients consumed.
          quantityToConsume = convertedTotalRequired * consumptionRatio;
        }

        // Ensure we don't consume negative amounts (safety check)
        quantityToConsume = Math.max(0, quantityToConsume);

        console.log(`[JO Completion] Consuming ${quantityToConsume} ${ingredientUom} of ${item.name}`);

        const stockBefore = parseFloat(item.current_stock);

        if (stockBefore < quantityToConsume) {
          console.error(`[JO Completion] Insufficient Stock for ${item.name}. Req: ${quantityToConsume}, Avail: ${stockBefore}`);
          const error = new Error(`Insufficient stock for ${item.name}. Required: ${quantityToConsume.toFixed(2)} ${ingredientUom}, Available: ${stockBefore.toFixed(2)} ${ingredientUom}`);
          error.statusCode = 400;
          throw error;
        }

        // Use centralized service for consumption
        // PASS TRANSACTION 't'
        const movement = await createStockMovement({
          item_id: item.item_id,
          quantity: quantityToConsume,
          movement_type: 'production_consumption',
          reference_id: jo.jo_number,
          reference_type: 'JO',
          notes: `Partial production: ${qtyToProcess} units`,
          // batch_id could be passed if specific batch was selected, but for auto-FIFO we leave it null.
          // Ideally JO completion could allow manual batch selection, but for now we default to FIFO.
        }, userId, t);

        // Update stock (re-read from item as service updated it, or calculate)
        const stockAfter = stockBefore - quantityToConsume;

        // Update ingredient record with batch reference and INCREMENT consumption
        await ingredient.update({
          quantity_consumed: parseFloat(ingredient.quantity_consumed || 0) + quantityToConsume,
          stock_before: ingredient.stock_before === null ? stockBefore : ingredient.stock_before,
          stock_after: stockAfter,
          batch_id: movement.batch_id || ingredient.batch_id // Track primary batch used
        }, { transaction: t });
      }

      // Add finished product to stock via Service
      const product = jo.product;

      console.log(`[JO Completion] Adding Product Stock: ${qtyToProcess} of ${product.name}`);

      // Create production output movement
      // Use createStockMovement with 'production_output' which handles positive addition
      // PASS TRANSACTION 't'
      const productionMovement = await createStockMovement({
        item_id: product.item_id,
        quantity: qtyToProcess,
        movement_type: 'production_output',
        reference_id: jo.jo_number,
        reference_type: 'JO',
        notes: notes || null,
        expiry_date: expiryDateOverride || null, // Service handles fallback to shelf life
        cost_per_unit: product.cost_per_unit, // Product cost (should be calculated from ingredients, but current logic uses static cost)
        po_number: jo.jo_number // Use JO number as "PO Number" for batch
      }, userId, t);

      // Update JO status, quantity_produced, and save notes
      const newQuantityProduced = currentQuantityProduced + qtyToProcess;
      const newStatus = isFinalCompletion ? 'completed' : 'partial';

      await jo.update({
        status: newStatus,
        quantity_produced: newQuantityProduced,
        completion_date: isFinalCompletion ? new Date() : null, // Only set completion date when fully finished? Or update last activity? Usually completion_date implies "Finished".
        completed_by: isFinalCompletion ? userId : null,
        notes: notes ? (jo.notes ? `${jo.notes}\n${notes}` : notes) : jo.notes, // Append notes,
        quality_check: qualityCheck || jo.quality_check // Update quality check status
      }, { transaction: t });

      // Reload JO with all associations including item details
      const completedJO = await JobOrder.findByPk(jo.jo_id, {
        include: [
          {
            model: JOIngredient,
            as: 'ingredients',
            include: [{
              model: Item,
              as: 'item',
              attributes: ['item_id', 'name', 'unit_of_measure']
            }, {
              model: FIFOBatch,
              as: 'batch'
            }]
          },
          {
            model: Item,
            as: 'product',
            attributes: ['item_id', 'name', 'unit_of_measure']
          }
        ],
        transaction: t
      });

      // Transform ingredients to match frontend expectations
      const ingredientsConsumed = completedJO.ingredients.map(ing => ({
        item_id: ing.item_id,
        item_name: ing.item?.name || 'Unknown',
        unit_of_measure: ing.item?.unit_of_measure || '',
        quantity_required: parseFloat(ing.quantity_required),
        quantity_consumed: parseFloat(ing.quantity_consumed),
        stock_before: parseFloat(ing.stock_before),
        stock_after: parseFloat(ing.stock_after),
        batch_info: ing.batch ? {
          batch_id: ing.batch.batch_id,
          expiry_date: ing.batch.expiry_date,
          po_number: ing.batch.po_number
        } : null
      }));

      console.log(`[JO Completion] Successfully finished. Status: ${newStatus}`);

      // Return enriched data
      return {
        ...completedJO.toJSON(),
        ingredients_consumed: ingredientsConsumed
      };
    } catch (error) {
      console.error(`[JO Completion Error] ${error.message}`);
      console.error(error.stack);
      // Transaction will automatically rollback when this block throws
      throw error;
    }
  });
};

export const archiveJobOrder = async (joId, userId) => {
  const JobOrder = dbStore.get('JobOrder');

  const jo = await JobOrder.findByPk(joId);

  if (!jo) {
    const error = new Error('Job Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (jo.archived_at) {
    const error = new Error('Job Order is already archived');
    error.statusCode = 400;
    throw error;
  }

  await jo.update({
    archived_at: new Date(),
    archived_by: userId
  });

  return jo;
};

export const restoreJobOrder = async (joId) => {
  const JobOrder = dbStore.get('JobOrder');

  const jo = await JobOrder.findByPk(joId);

  if (!jo) {
    const error = new Error('Job Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (!jo.archived_at) {
    const error = new Error('Job Order is not archived');
    error.statusCode = 400;
    throw error;
  }

  await jo.update({
    archived_at: null,
    archived_by: null
  });

  return jo;
};

// ==========================================
// AI TOOL HELPER: Production Feasibility
// ==========================================
export const checkProductionFeasibility = async (productId, quantity = 1, includeChain = false) => {
  const Item = dbStore.get('Item');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  // 1. Fetch Product with Ingredients manually via ProductComposition
  const product = await Item.findByPk(productId, {
    attributes: ['item_id', 'name', 'unit_of_measure', 'current_stock', 'cost_per_unit'],
    include: [{
      model: sequelize.models.ProductComposition, // Use the model name string or object if available
      as: 'productCompositions',
      include: [{
        model: Item,
        as: 'ingredient',
        attributes: ['item_id', 'name', 'current_stock', 'cost_per_unit', 'unit_of_measure']
      }]
    }]
  });

  if (!product) {
    throw new Error(`Product with ID ${productId} not found.`);
  }

  if (!product.productCompositions || product.productCompositions.length === 0) {
    return {
      product_id: product.item_id,
      product_name: product.name,
      feasible: false,
      max_producable: 0,
      reason: "No ingredients defined (product composition is empty).",
      missing_ingredients: [],
      total_cost_est: 0
    };
  }

  // 2. Calculate feasibility with UOM conversion support
  let maxProducable = Infinity;
  const ingredientAnalysis = [];
  let totalCostStub = 0;

  for (const comp of product.productCompositions) {
    const ing = comp.ingredient;
    if (!ing) continue; // safety check

    const requiredPerUnit = parseFloat(comp.quantity_required);
    const stockAvailable = parseFloat(ing.current_stock);
    const costPerUnit = parseFloat(ing.cost_per_unit || 0);

    // Get UOMs for conversion
    const ingredientUom = normalizeUom(ing.unit_of_measure);
    const recipeUom = normalizeUom(comp.unit_of_measure || ing.unit_of_measure);

    // Convert required quantity to ingredient's UOM if compatible
    let convertedRequiredPerUnit = requiredPerUnit;
    let wasConverted = false;

    if (areCompatible(recipeUom, ingredientUom) && recipeUom !== ingredientUom) {
      const converted = convertQuantity(requiredPerUnit, recipeUom, ingredientUom);
      if (converted !== null) {
        convertedRequiredPerUnit = converted;
        wasConverted = true;
      }
    } else if (recipeUom !== ingredientUom) {
      // For feasibility check, instead of throwing, we mark as infeasible with reason
      return {
        product_id: product.item_id,
        product_name: product.name,
        feasible: false,
        max_producable: 0,
        reason: `Incompatible units for ingredient ${ing.name}: Cannot convert ${recipeUom} to ${ingredientUom}`,
        missing_ingredients: [],
        total_cost_est: 0
      };
    }

    const requiredTotal = convertedRequiredPerUnit * quantity;
    const potentialUnits = stockAvailable > 0 ? stockAvailable / convertedRequiredPerUnit : 0;

    if (potentialUnits < maxProducable) {
      maxProducable = potentialUnits;
    }

    const isSufficient = stockAvailable >= requiredTotal;

    totalCostStub += (requiredTotal * costPerUnit);

    ingredientAnalysis.push({
      ingredient_name: ing.name,
      available: stockAvailable,
      required_per_unit: convertedRequiredPerUnit,
      required_per_unit_original: wasConverted ? requiredPerUnit : null,
      required_per_unit_original_uom: wasConverted ? recipeUom : null,
      required_total: requiredTotal,
      unit: ingredientUom,
      is_sufficient: isSufficient,
      shortage: isSufficient ? 0 : (requiredTotal - stockAvailable),
      converted: wasConverted
    });
  }

  // Round down maxProducable to manageable number (2 decimals)
  maxProducable = Math.floor(maxProducable * 100) / 100;

  // 3. Construct Result
  return {
    product_id: product.item_id,
    product_name: product.name,
    requested_quantity: quantity,
    feasible: maxProducable >= quantity,
    max_possible_units: maxProducable,
    limiting_factor: ingredientAnalysis.find(i => !i.is_sufficient)?.ingredient_name || null,
    ingredients: ingredientAnalysis,
    estimated_cost: totalCostStub,
    note: includeChain ? "Feasibility analysis complete." : undefined
  };
};
