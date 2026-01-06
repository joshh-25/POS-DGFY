import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Item from '../models/Item.js';
import FIFOBatch from '../models/FIFOBatch.js';
import ItemNutrition from '../models/ItemNutrition.js';
import ItemAllergen from '../models/ItemAllergen.js';
import ItemPhysicalProperties from '../models/ItemPhysicalProperties.js';
import ItemShelfLife from '../models/ItemShelfLife.js';
import ItemPackaging from '../models/ItemPackaging.js';
import ItemQualityControl from '../models/ItemQualityControl.js';
import ItemRegulatoryCompliance from '../models/ItemRegulatoryCompliance.js';
import ItemCostBreakdown from '../models/ItemCostBreakdown.js';
import ProductComposition from '../models/ProductComposition.js';
import SupplierItem from '../models/SupplierItem.js';
import Supplier from '../models/Supplier.js';
import StockMovement from '../models/StockMovement.js';
import User from '../models/User.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import POLineItem from '../models/POLineItem.js';
import JobOrder from '../models/JobOrder.js';
import JOIngredient from '../models/JOIngredient.js';
import { validateComposition, invalidateDependencyGraphCache } from './compositionValidationService.js';

export const getItems = async (queryParams) => {
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

  // Search filter
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { sku_code: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } }
    ];
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
          attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'current_stock']
        }]
      }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order
  });

  // DEBUG: Log what Sequelize returns
  const productSample = rows.find(r => r.category === 'product');
  if (productSample) {
    console.log('=== PRODUCT SAMPLE (RAW FROM SEQUELIZE) ===');
    console.log('Product name:', productSample.name);
    console.log('Product category:', productSample.category);
    console.log('Has productCompositions:', !!productSample.productCompositions);
    console.log('ProductCompositions count:', productSample.productCompositions?.length || 0);
    if (productSample.productCompositions && productSample.productCompositions.length > 0) {
      console.log('First composition:', JSON.stringify(productSample.productCompositions[0].toJSON(), null, 2));
    }
  }

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
        required: false,
        where: sequelize.where(
          sequelize.col('fifoBatches.quantity'),
          Op.gt,
          sequelize.col('fifoBatches.quantity_consumed')
        )
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
  }

  return formattedItem;
};

export const createItem = async (itemData, userId = null) => {
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

    // Create the item
    const dataToCreate = { ...dbFields };

    const item = await Item.create(dataToCreate, { transaction });

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
  const transaction = await sequelize.transaction();

  try {
    const item = await Item.findByPk(itemId);

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

    // Update item basic fields
    dbFields.updated_by = userId;
    await item.update(dbFields, { transaction });

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
      attributes: ['po_number', 'status']
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
      attributes: ['jo_number', 'status']
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

    // Reload item with all associations
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
  const movements = await StockMovement.findAll({
    where: { item_id: itemId },
    order: [['timestamp', 'DESC']],
    limit: 50
  });

  return movements;
};

