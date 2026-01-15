import { parse } from 'csv-parse/sync';
import { Op } from 'sequelize';
import Item from '../models/Item.js';
import { createItemSchema, updateItemSchema } from '../validators/itemValidator.js';
import sequelize from '../config/database.js';

// Valid values for enums
const VALID_CATEGORIES = ['raw_material', 'packaging', 'product', 'supplies'];
const VALID_PRODUCT_TYPES = ['work_in_progress', 'finished_goods'];
const VALID_ALLERGENS = ['milk', 'eggs', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame'];

/**
 * Parse CSV content and transform rows to item format
 */
export const parseCSV = (csvContent) => {
    try {
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            cast: false // Keep as strings, we'll transform manually
        });
        return { success: true, records };
    } catch (error) {
        return { success: false, error: `CSV parsing error: ${error.message}` };
    }
};

/**
 * Transform a CSV row to item data format
 */
const transformRow = (row) => {
    const item = {};

    // Core fields
    if (row.sku_code) item.sku_code = row.sku_code.trim();
    if (row.name) item.name = row.name.trim();
    if (row.category) item.category = row.category.trim().toLowerCase();
    if (row.product_type) {
        const pt = row.product_type.trim().toLowerCase();
        item.product_type = pt || null;
    } else {
        item.product_type = null;
    }
    if (row.description) item.description = row.description.trim();
    if (row.product_folder) item.product_folder = row.product_folder.trim();

    // Numeric fields
    if (row.max_capacity) item.max_capacity = parseFloat(row.max_capacity) || null;
    if (row.current_stock !== undefined && row.current_stock !== '') {
        const stock = parseFloat(row.current_stock);
        item.current_stock = isNaN(stock) ? 0 : stock;
    }
    if (row.min_threshold) item.min_threshold = parseFloat(row.min_threshold) || null;
    if (row.purchase_allowance) item.purchase_allowance = parseFloat(row.purchase_allowance) || null;
    if (row.cost_per_unit) item.cost_per_unit = parseFloat(row.cost_per_unit) || null;
    if (row.shelf_life_days) item.shelf_life_days = parseInt(row.shelf_life_days) || null;
    if (row.opened_shelf_life_days) item.opened_shelf_life_days = parseInt(row.opened_shelf_life_days) || null;
    if (row.batch_size) item.batch_size = parseFloat(row.batch_size) || null;
    if (row.yield_percentage) item.yield_percentage = parseFloat(row.yield_percentage) || null;
    if (row.processing_loss) item.processing_loss = parseFloat(row.processing_loss) || null;

    // Unit of measure
    if (row.unit_of_measure) item.unit_of_measure = row.unit_of_measure.trim();

    // Boolean fields
    if (row.fifo_enabled !== undefined && row.fifo_enabled !== '') {
        item.fifo_enabled = row.fifo_enabled.toLowerCase() === 'true' || row.fifo_enabled === '1';
    }

    // Text fields
    if (row.production_notes) item.production_notes = row.production_notes.trim();

    // Packaging specs (flattened columns)
    const packagingSpecs = {};
    if (row.packaging_height) packagingSpecs.height = row.packaging_height.trim();
    if (row.packaging_width) packagingSpecs.width = row.packaging_width.trim();
    if (row.packaging_thickness) packagingSpecs.thickness = row.packaging_thickness.trim();
    if (row.packaging_material) packagingSpecs.material = row.packaging_material.trim();
    if (row.packaging_design) packagingSpecs.design = row.packaging_design.trim();
    if (row.packaging_contents) packagingSpecs.contents = row.packaging_contents.trim();
    if (Object.keys(packagingSpecs).length > 0) {
        item.packaging_specs = packagingSpecs;
    }

    // Allergens (comma-separated)
    if (row.allergens) {
        const allergenList = row.allergens.split(',').map(a => a.trim().toLowerCase()).filter(a => a);
        if (allergenList.length > 0) {
            item.allergens = allergenList;
        }
    }

    return item;
};

/**
 * Validate a single item and check for existing SKU
 */
const validateItem = async (itemData, rowIndex, existingSkus) => {
    const errors = [];
    let action = 'CREATE';
    let existingItemId = null;

    // Check if SKU already exists
    if (itemData.sku_code && existingSkus.has(itemData.sku_code)) {
        action = 'UPDATE';
        existingItemId = existingSkus.get(itemData.sku_code);
    }

    // Choose validator based on action
    const schema = action === 'CREATE' ? createItemSchema : updateItemSchema;
    const { error, value } = schema.validate(itemData, { abortEarly: false, stripUnknown: true });

    if (error) {
        errors.push(...error.details.map(d => d.message));
    }

    // Validate current_stock if present
    if (itemData.current_stock !== undefined && itemData.current_stock !== null) {
        if (itemData.current_stock < 0) {
            errors.push('Current stock cannot be negative');
        }
    }

    // Additional validation: product_type required for product category
    if (itemData.category === 'product' && !itemData.product_type) {
        errors.push('product_type is required when category is "product"');
    }

    // Validate category value
    if (itemData.category && !VALID_CATEGORIES.includes(itemData.category)) {
        errors.push(`Invalid category: ${itemData.category}. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    // Validate product_type value
    if (itemData.product_type && !VALID_PRODUCT_TYPES.includes(itemData.product_type)) {
        errors.push(`Invalid product_type: ${itemData.product_type}. Must be one of: ${VALID_PRODUCT_TYPES.join(', ')}`);
    }

    // Validate allergens
    if (itemData.allergens) {
        const invalidAllergens = itemData.allergens.filter(a => !VALID_ALLERGENS.includes(a));
        if (invalidAllergens.length > 0) {
            errors.push(`Invalid allergens: ${invalidAllergens.join(', ')}. Valid: ${VALID_ALLERGENS.join(', ')}`);
        }
    }

    return {
        rowIndex,
        action,
        existingItemId,
        data: value || itemData,
        valid: errors.length === 0,
        errors
    };
};

/**
 * Preview CSV import - validate all rows and return preview data
 */
export const previewImport = async (csvContent) => {
    // Parse CSV
    const parseResult = parseCSV(csvContent);
    if (!parseResult.success) {
        return { success: false, error: parseResult.error };
    }

    const records = parseResult.records;
    if (records.length === 0) {
        return { success: false, error: 'CSV file is empty or has no data rows' };
    }

    // Detect template type from headers
    const headers = Object.keys(records[0]);
    const templateType = detectTemplateType(headers);

    // Get all existing SKUs for upsert detection
    const existingItems = await Item.findAll({
        attributes: ['item_id', 'sku_code'],
        where: { status: { [Op.in]: ['active', 'draft'] } }
    });
    const existingSkus = new Map(existingItems.map(i => [i.sku_code, i.item_id]));

    // Transform and validate each row
    const previewRows = [];
    let validCount = 0;
    let createCount = 0;
    let updateCount = 0;

    for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const itemData = transformRow(row);
        const validation = await validateItem(itemData, i + 1, existingSkus);

        // Additional validation: check category matches template type
        if (validation.valid && templateType !== TEMPLATE_TYPES.MASTER) {
            const categoryValidation = validateCategoryForTemplate(itemData.category, templateType);
            if (!categoryValidation.valid) {
                validation.valid = false;
                validation.errors.push(categoryValidation.error);
            }
        }

        previewRows.push({
            rowNumber: i + 1,
            sku_code: itemData.sku_code || '',
            name: itemData.name || '',
            category: itemData.category || '',
            action: validation.action,
            valid: validation.valid,
            errors: validation.errors,
            data: validation.data,
            existingItemId: validation.existingItemId
        });

        if (validation.valid) {
            validCount++;
            if (validation.action === 'CREATE') createCount++;
            else updateCount++;
        }
    }

    return {
        success: true,
        templateType,
        totalRows: records.length,
        validRows: validCount,
        invalidRows: records.length - validCount,
        createCount,
        updateCount,
        rows: previewRows
    };
};

/**
 * Confirm and execute the import
 */
export const confirmImport = async (rows, userId) => {
    const transaction = await sequelize.transaction();

    try {
        const results = {
            created: [],
            updated: [],
            failed: []
        };

        for (const row of rows) {
            if (!row.valid) {
                results.failed.push({
                    rowNumber: row.rowNumber,
                    sku_code: row.sku_code,
                    errors: row.errors
                });
                continue;
            }

            try {
                if (row.action === 'CREATE') {
                    const newItem = await Item.create({
                        ...row.data,
                        status: 'active'
                    }, { transaction });

                    results.created.push({
                        rowNumber: row.rowNumber,
                        item_id: newItem.item_id,
                        sku_code: newItem.sku_code,
                        name: newItem.name
                    });
                } else {
                    // UPDATE
                    await Item.update(row.data, {
                        where: { item_id: row.existingItemId },
                        transaction
                    });

                    results.updated.push({
                        rowNumber: row.rowNumber,
                        item_id: row.existingItemId,
                        sku_code: row.sku_code,
                        name: row.data.name
                    });
                }
            } catch (error) {
                results.failed.push({
                    rowNumber: row.rowNumber,
                    sku_code: row.sku_code,
                    errors: [error.message]
                });
            }
        }

        await transaction.commit();

        return {
            success: true,
            createdCount: results.created.length,
            updatedCount: results.updated.length,
            failedCount: results.failed.length,
            results
        };
    } catch (error) {
        await transaction.rollback();
        return {
            success: false,
            error: `Import failed: ${error.message}`
        };
    }
};

// Template type constants
export const TEMPLATE_TYPES = {
    ITEMS: 'items',
    PRODUCTS: 'products',
    MASTER: 'master' // Legacy support - all columns
};

// Items template headers (Raw Materials, Packaging, Supplies)
export const ITEMS_HEADERS = [
    'sku_code',
    'name',
    'category',
    'description',
    'current_stock',
    'max_capacity',
    'min_threshold',
    'purchase_allowance',
    'unit_of_measure',
    'cost_per_unit',
    'fifo_enabled',
    'shelf_life_days',
    'opened_shelf_life_days',
    'allergens',
    'packaging_height',
    'packaging_width',
    'packaging_thickness',
    'packaging_material',
    'packaging_design',
    'packaging_contents'
];

// Products template headers (WIP, Finished Goods)
export const PRODUCTS_HEADERS = [
    'sku_code',
    'name',
    'category',
    'product_type',
    'description',
    'product_folder',
    'current_stock',
    'max_capacity',
    'min_threshold',
    'unit_of_measure',
    'cost_per_unit',
    'fifo_enabled',
    'shelf_life_days',
    'opened_shelf_life_days',
    'batch_size',
    'yield_percentage',
    'processing_loss',
    'production_notes'
];

// Valid categories for each template type
export const ITEMS_CATEGORIES = ['raw_material', 'packaging', 'supplies'];
export const PRODUCTS_CATEGORIES = ['product'];

/**
 * Detect template type from CSV headers
 * @param {Array<string>} headers - Array of header names from CSV
 * @returns {string} - 'items', 'products', or 'master'
 */
export const detectTemplateType = (headers) => {
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
        return TEMPLATE_TYPES.MASTER;
    }

    const headerSet = new Set(headers.map(h => h.toLowerCase().trim()));

    // Check for products-specific columns
    const hasProductType = headerSet.has('product_type');
    const hasProductFolder = headerSet.has('product_folder');
    const hasBatchSize = headerSet.has('batch_size');
    const hasYieldPercentage = headerSet.has('yield_percentage');

    // Check for items-specific columns
    const hasAllergens = headerSet.has('allergens');
    const hasPackagingHeight = headerSet.has('packaging_height');

    // If has product-specific columns and no items-specific columns -> products template
    if ((hasProductType || hasProductFolder || hasBatchSize || hasYieldPercentage) &&
        !hasAllergens && !hasPackagingHeight) {
        return TEMPLATE_TYPES.PRODUCTS;
    }

    // If has items-specific columns and no product-specific columns -> items template
    if ((hasAllergens || hasPackagingHeight) &&
        !hasProductType && !hasProductFolder && !hasBatchSize) {
        return TEMPLATE_TYPES.ITEMS;
    }

    // Has both or neither -> master template (legacy)
    return TEMPLATE_TYPES.MASTER;
};

/**
 * Validate that category matches template type
 * @param {string} category - Item category
 * @param {string} templateType - Template type
 * @returns {object} - { valid: boolean, error?: string }
 */
export const validateCategoryForTemplate = (category, templateType) => {
    if (templateType === TEMPLATE_TYPES.MASTER) {
        return { valid: true };
    }

    if (templateType === TEMPLATE_TYPES.ITEMS) {
        if (!ITEMS_CATEGORIES.includes(category)) {
            return {
                valid: false,
                error: `Category '${category}' is not valid for Items template. Use: ${ITEMS_CATEGORIES.join(', ')}`
            };
        }
    }

    if (templateType === TEMPLATE_TYPES.PRODUCTS) {
        if (!PRODUCTS_CATEGORIES.includes(category)) {
            return {
                valid: false,
                error: `Category '${category}' is not valid for Products template. Only 'product' category is allowed.`
            };
        }
    }

    return { valid: true };
};

/**
 * Generate CSV template headers
 * @param {string} type - 'items', 'products', or 'master' (default)
 */
export const getTemplateHeaders = (type = TEMPLATE_TYPES.MASTER) => {
    switch (type) {
        case TEMPLATE_TYPES.ITEMS:
            return [...ITEMS_HEADERS];
        case TEMPLATE_TYPES.PRODUCTS:
            return [...PRODUCTS_HEADERS];
        case TEMPLATE_TYPES.MASTER:
        default:
            // Return all columns for backwards compatibility
            return [
                'sku_code',
                'name',
                'category',
                'product_type',
                'description',
                'product_folder',
                'max_capacity',
                'current_stock',
                'min_threshold',
                'purchase_allowance',
                'unit_of_measure',
                'cost_per_unit',
                'fifo_enabled',
                'shelf_life_days',
                'opened_shelf_life_days',
                'batch_size',
                'yield_percentage',
                'processing_loss',
                'production_notes',
                'packaging_height',
                'packaging_width',
                'packaging_thickness',
                'packaging_material',
                'packaging_design',
                'packaging_contents',
                'allergens'
            ];
    }
};
