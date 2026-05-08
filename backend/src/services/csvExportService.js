import { Op } from 'sequelize';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import dbStore from '../utils/dbStore.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';
import { getAllSettingsUseCase } from '../modules/settings/index.js';
import { unwrapApplicationResultOrThrow } from '../modules/shared/contracts/applicationResultHelpers.js';
import {
    DEFAULT_WORKFLOW_MODE,
    normalizeWorkflowMode,
    resolveWorkflowTemplateMode
} from '../modules/shared/constants/workflowModes.js';
import {
    CORRECTED_ITEM_TAXONOMY_MODES,
    ITEM_STOCK_BEHAVIOR,
    findItemPresetForValues
} from '../modules/shared/constants/modeItemTaxonomy.js';
import {
    TEMPLATE_SCHEMA_VERSION,
    buildTemplateSignature,
    getTemplateDefinition,
    getTemplateHeaders,
    ITEMS_CATEGORIES,
    PRODUCTS_CATEGORIES,
    TEMPLATE_TYPES
} from './csvImportService.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const LEGACY_TEMPLATE_TYPES = Object.freeze([
    TEMPLATE_TYPES.ITEMS,
    TEMPLATE_TYPES.PRODUCTS,
    TEMPLATE_TYPES.MASTER
]);

/**
 * Get Sequelize include options for fetching related product data
 * Used to ensure exports include all wizard fields from related tables
 */
/**
 * Get Sequelize include options for fetching related product data
 * Used to ensure exports include all wizard fields from related tables
 */
const getProductExportIncludes = () => {
    const ItemNutrition = dbStore.get('ItemNutrition');
    const ItemAllergen = dbStore.get('ItemAllergen');
    const ItemPhysicalProperties = dbStore.get('ItemPhysicalProperties');
    const ItemShelfLife = dbStore.get('ItemShelfLife');
    const ItemPackaging = dbStore.get('ItemPackaging');
    const ItemQualityControl = dbStore.get('ItemQualityControl');
    const ItemRegulatoryCompliance = dbStore.get('ItemRegulatoryCompliance');
    const ItemCostBreakdown = dbStore.get('ItemCostBreakdown');
    const ItemBarcode = dbStore.get('ItemBarcode');

    return [
        { model: ItemNutrition, as: 'nutrition', required: false },
        { model: ItemAllergen, as: 'allergens', required: false },
        { model: ItemPhysicalProperties, as: 'physicalProperties', required: false },
        { model: ItemShelfLife, as: 'shelfLife', required: false },
        { model: ItemPackaging, as: 'packaging', required: false },
        { model: ItemQualityControl, as: 'qualityControl', required: false },
        { model: ItemRegulatoryCompliance, as: 'regulatoryCompliance', required: false },
        { model: ItemCostBreakdown, as: 'costBreakdown', required: false },
        {
            model: ItemBarcode,
            as: 'barcodes',
            required: false,
            where: { is_active: true },
            separate: true,
            order: [
                ['is_primary', 'DESC'],
                ['updated_at', 'DESC']
            ]
        }
    ];
};

const getPrimaryBarcode = (item) => {
    const aliases = Array.isArray(item?.barcodes) ? item.barcodes : [];
    return aliases.find((alias) => alias?.is_primary === true) || aliases[0] || null;
};

const formatBarcodeExportCells = (item) => {
    const barcode = getPrimaryBarcode(item);
    const aliases = Array.isArray(item?.barcodes) ? item.barcodes : [];
    const aliasCell = aliases
        .filter((alias) => alias?.code && alias?.item_barcode_id !== barcode?.item_barcode_id)
        .map((alias) => [
            alias.code,
            alias.source || '',
            alias.scope || '',
            alias.packaging_level || '',
            alias.quantity_multiplier != null ? String(alias.quantity_multiplier) : ''
        ].join('|'))
        .join(';');
    return [
        barcode?.code || '',
        barcode?.source || '',
        barcode?.scope || '',
        barcode?.packaging_level || '',
        barcode?.quantity_multiplier != null ? String(barcode.quantity_multiplier) : '',
        aliasCell
    ];
};

const barcodeExportMap = (item) => {
    const [
        barcode,
        barcodeSource,
        barcodeScope,
        barcodePackagingLevel,
        barcodeQuantityMultiplier,
        barcodeAliases
    ] = formatBarcodeExportCells(item);

    return {
        barcode,
        barcode_source: barcodeSource,
        barcode_scope: barcodeScope,
        barcode_packaging_level: barcodePackagingLevel,
        barcode_quantity_multiplier: barcodeQuantityMultiplier,
        barcode_aliases: barcodeAliases
    };
};

const valueCell = (value, fallback = '') => (
    value !== undefined && value !== null ? String(value) : fallback
);

const booleanCell = (value) => (value ? 'TRUE' : 'FALSE');

const formatDirectAllergens = (item) => {
    const allergens = item?.allergens || [];
    if (!Array.isArray(allergens)) {
        return valueCell(allergens);
    }

    return allergens
        .filter((entry) => !entry?.is_cross_contamination)
        .map((entry) => (
            typeof entry === 'string'
                ? entry
                : (entry?.allergen_name || entry?.name || '')
        ))
        .filter(Boolean)
        .join(',');
};

const getPackagingSpecs = (item) => item?.packaging_specs || {};

const resolveTenantWorkflowMode = async () => {
    const settings = unwrapApplicationResultOrThrow(
        await getAllSettingsUseCase(),
        'Failed to retrieve settings for workflow-mode export'
    );
    return normalizeWorkflowMode(settings?.[WORKFLOW_MODE_SETTING_KEY]?.value ?? DEFAULT_WORKFLOW_MODE);
};

const resolveExportWorkflowMode = async (workflowMode) => {
    const rawMode = String(workflowMode || '').trim();
    const tenantWorkflowMode = rawMode ? normalizeWorkflowMode(rawMode) : await resolveTenantWorkflowMode();
    const templateMode = resolveWorkflowTemplateMode(tenantWorkflowMode);
    return CORRECTED_ITEM_TAXONOMY_MODES.includes(templateMode) ? templateMode : null;
};

const shouldUseLegacyExport = (options = {}) => (
    options.templateType && LEGACY_TEMPLATE_TYPES.includes(options.templateType)
);

const getModeCompatibilityNote = (workflowMode) => {
    const labels = {
        food_manufacturing: 'Food Manufacturing',
        msme: 'Simple (MSME)',
        services: 'Services',
        fnb: 'Food & Beverage'
    };
    return `This CSV template is for ${labels[workflowMode] || workflowMode} mode only. It will be rejected for incompatible tenant modes.`;
};

const resolveModePresetForItem = (workflowMode, item = {}) => {
    if (item.mode_item_preset) return item.mode_item_preset;
    return findItemPresetForValues(workflowMode, {
        category: item.category,
        product_type: item.product_type,
        unit_of_measure: item.unit_of_measure
    })?.key || '';
};

const buildModeFieldMap = (item, workflowMode, templateMetadata) => {
    const packagingSpecs = getPackagingSpecs(item);
    const modePreset = resolveModePresetForItem(workflowMode, item);
    const presetConfig = findItemPresetForValues(workflowMode, {
        category: item.category,
        product_type: item.product_type,
        unit_of_measure: item.unit_of_measure
    });
    const isStockExempt = item.category === 'service'
        || modePreset === 'service'
        || presetConfig?.stock_behavior === ITEM_STOCK_BEHAVIOR.STOCK_EXEMPT;

    return {
        sku_code: valueCell(item.sku_code),
        name: valueCell(item.name),
        category: valueCell(item.category),
        product_type: item.category === 'product' ? valueCell(item.product_type) : '',
        mode_item_preset: valueCell(modePreset),
        vat_type: valueCell(item.vat_type),
        description: valueCell(item.description),
        product_folder: valueCell(item.product_folder),
        max_capacity: valueCell(item.max_capacity),
        current_stock: isStockExempt ? '0' : valueCell(item.current_stock, '0'),
        min_threshold: valueCell(item.min_threshold),
        purchase_allowance: valueCell(item.purchase_allowance),
        unit_of_measure: valueCell(item.unit_of_measure),
        cost_per_unit: valueCell(item.cost_per_unit),
        default_sale_price: valueCell(item.default_sale_price),
        fifo_enabled: isStockExempt ? 'FALSE' : booleanCell(item.fifo_enabled),
        shelf_life_days: valueCell(item.shelf_life_days),
        opened_shelf_life_days: valueCell(item.opened_shelf_life_days),
        batch_size: valueCell(item.batch_size),
        yield_percentage: valueCell(item.yield_percentage),
        processing_loss: valueCell(item.processing_loss),
        production_notes: valueCell(item.production_notes),
        packaging_height: valueCell(packagingSpecs.height),
        packaging_width: valueCell(packagingSpecs.width),
        packaging_thickness: valueCell(packagingSpecs.thickness),
        packaging_material: valueCell(packagingSpecs.material),
        packaging_design: valueCell(packagingSpecs.design),
        packaging_contents: valueCell(packagingSpecs.contents),
        allergens: formatDirectAllergens(item),
        ...barcodeExportMap(item),
        template_workflow_mode: templateMetadata.workflowMode,
        mode_compatibility_note: getModeCompatibilityNote(templateMetadata.workflowMode),
        template_schema_version: templateMetadata.schemaVersion,
        template_issued_at: templateMetadata.issuedAt,
        template_signature: templateMetadata.signature
    };
};

const generateModeCSV = (items, workflowMode) => {
    const template = getTemplateDefinition({ workflowMode });
    const issuedAt = new Date().toISOString();
    const schemaVersion = TEMPLATE_SCHEMA_VERSION;
    const templateMetadata = {
        workflowMode: template.workflowMode,
        schemaVersion,
        issuedAt,
        signature: buildTemplateSignature({
            workflowMode: template.workflowMode,
            schemaVersion,
            issuedAt
        })
    };

    let csvContent = template.headers.join(',') + '\n';
    for (const item of items) {
        const fieldMap = buildModeFieldMap(item, template.workflowMode, templateMetadata);
        const row = template.headers.map((header) => fieldMap[header] ?? '');
        csvContent += row.map(escapeCSVCell).join(',') + '\n';
    }

    return {
        csvContent,
        templateType: 'workflow_mode',
        workflowMode: template.workflowMode,
        filename: template.filename.replace('_import_template.csv', '_export.csv')
    };
};

/**
 * Transform an Item to a CSV row for Items template
 */
const transformItemToItemsRow = (item) => {
    const packagingSpecs = item.packaging_specs || {};
    const allergensStr = Array.isArray(item.allergens)
        ? item.allergens.join(',')
        : (item.allergens || '');

    return [
        item.sku_code || '',
        item.name || '',
        item.category || '',
        item.description || '',
        item.current_stock != null ? String(item.current_stock) : '0',
        item.max_capacity != null ? String(item.max_capacity) : '',
        item.min_threshold != null ? String(item.min_threshold) : '',
        item.purchase_allowance != null ? String(item.purchase_allowance) : '',
        item.unit_of_measure || '',
        item.cost_per_unit != null ? String(item.cost_per_unit) : '',
        item.fifo_enabled ? 'TRUE' : 'FALSE',
        item.shelf_life_days != null ? String(item.shelf_life_days) : '',
        item.opened_shelf_life_days != null ? String(item.opened_shelf_life_days) : '',
        allergensStr,
        packagingSpecs.height || '',
        packagingSpecs.width || '',
        packagingSpecs.thickness || '',
        packagingSpecs.material || '',
        packagingSpecs.design || '',
        packagingSpecs.contents || '',
        ...formatBarcodeExportCells(item)
    ];
};

/**
 * Transform an Item to a CSV row for Products template
 * Includes all related table data (nutrition, allergens, physical properties, etc.)
 */
const transformItemToProductsRow = (item) => {
    // Extract related data with defaults
    const nutrition = item.nutrition || {};
    const physical = item.physicalProperties || {};
    const shelfLife = item.shelfLife || {};
    const packaging = item.packaging || {};
    const qc = item.qualityControl || {};
    const compliance = item.regulatoryCompliance || {};
    const costBreakdown = item.costBreakdown || {};

    // Format allergens as comma-separated strings
    const allergensArr = item.allergens || [];
    const directAllergens = Array.isArray(allergensArr)
        ? allergensArr.filter(a => !a.is_cross_contamination).map(a => a.allergen_name).join(',')
        : '';
    const mayContainAllergens = Array.isArray(allergensArr)
        ? allergensArr.filter(a => a.is_cross_contamination).map(a => a.allergen_name).join(',')
        : '';

    return [
        // Core fields (from items table)
        item.sku_code || '',
        item.name || '',
        item.category || '',
        item.product_type || '',
        item.mode_item_preset || '',
        item.vat_type || '',
        item.description || '',
        item.product_folder || '',
        item.current_stock != null ? String(item.current_stock) : '0',
        item.max_capacity != null ? String(item.max_capacity) : '',
        item.min_threshold != null ? String(item.min_threshold) : '',
        item.unit_of_measure || '',
        item.cost_per_unit != null ? String(item.cost_per_unit) : '',
        item.fifo_enabled ? 'TRUE' : 'FALSE',
        item.shelf_life_days != null ? String(item.shelf_life_days) : '',
        item.opened_shelf_life_days != null ? String(item.opened_shelf_life_days) : '',
        item.batch_size != null ? String(item.batch_size) : '',
        item.yield_percentage != null ? String(item.yield_percentage) : '',
        item.processing_loss != null ? String(item.processing_loss) : '',
        item.production_notes || '',

        // Nutritional Info
        nutrition.serving_size || '',
        nutrition.calories != null ? String(nutrition.calories) : '',
        nutrition.total_fat != null ? String(nutrition.total_fat) : '',
        nutrition.saturated_fat != null ? String(nutrition.saturated_fat) : '',
        nutrition.cholesterol != null ? String(nutrition.cholesterol) : '',
        nutrition.sodium != null ? String(nutrition.sodium) : '',
        nutrition.total_carbohydrates != null ? String(nutrition.total_carbohydrates) : '',
        nutrition.dietary_fiber != null ? String(nutrition.dietary_fiber) : '',
        nutrition.sugars != null ? String(nutrition.sugars) : '',
        nutrition.protein != null ? String(nutrition.protein) : '',

        // Allergens
        directAllergens,
        mayContainAllergens,

        // Physical Properties
        physical.texture || '',
        physical.color || '',
        physical.viscosity || '',
        physical.ph_level != null ? String(physical.ph_level) : '',
        physical.water_activity != null ? String(physical.water_activity) : '',

        // Extended Shelf Life
        shelfLife.storage_temperature || '',
        shelfLife.storage_conditions || '',

        // Packaging Info
        packaging.primary_packaging || '',
        packaging.secondary_packaging || '',
        packaging.packaging_material || '',
        packaging.net_weight || '',
        packaging.label_compliance ? 'TRUE' : 'FALSE',

        // Cost Breakdown
        costBreakdown.labor_cost != null ? String(costBreakdown.labor_cost) : '',
        costBreakdown.overhead_cost != null ? String(costBreakdown.overhead_cost) : '',
        costBreakdown.additional_packaging_cost != null ? String(costBreakdown.additional_packaging_cost) : '',

        // Quality Control
        qc.test_frequency || '',
        qc.sampling_plan || '',
        qc.acceptance_criteria || '',
        qc.corrective_actions || '',

        // Regulatory Compliance
        compliance.fda_approved ? 'TRUE' : 'FALSE',
        compliance.gmp_compliant ? 'TRUE' : 'FALSE',
        compliance.haccp_plan ? 'TRUE' : 'FALSE',
        compliance.organic_certified ? 'TRUE' : 'FALSE',
        compliance.kosher_certified ? 'TRUE' : 'FALSE',
        compliance.halal_certified ? 'TRUE' : 'FALSE',
        ...formatBarcodeExportCells(item)
    ];
};

/**
 * Transform an Item to a CSV row for Master template (all columns)
 */
const transformItemToMasterRow = (item) => {
    const packagingSpecs = item.packaging_specs || {};
    const allergensStr = Array.isArray(item.allergens)
        ? item.allergens.join(',')
        : (item.allergens || '');

    return [
        item.sku_code || '',
        item.name || '',
        item.category || '',
        item.product_type || '',
        item.mode_item_preset || '',
        item.vat_type || '',
        item.description || '',
        item.product_folder || '',
        item.max_capacity != null ? String(item.max_capacity) : '',
        item.current_stock != null ? String(item.current_stock) : '0',
        item.min_threshold != null ? String(item.min_threshold) : '',
        item.purchase_allowance != null ? String(item.purchase_allowance) : '',
        item.unit_of_measure || '',
        item.cost_per_unit != null ? String(item.cost_per_unit) : '',
        item.fifo_enabled ? 'TRUE' : 'FALSE',
        item.shelf_life_days != null ? String(item.shelf_life_days) : '',
        item.opened_shelf_life_days != null ? String(item.opened_shelf_life_days) : '',
        item.batch_size != null ? String(item.batch_size) : '',
        item.yield_percentage != null ? String(item.yield_percentage) : '',
        item.processing_loss != null ? String(item.processing_loss) : '',
        item.production_notes || '',
        packagingSpecs.height || '',
        packagingSpecs.width || '',
        packagingSpecs.thickness || '',
        packagingSpecs.material || '',
        packagingSpecs.design || '',
        packagingSpecs.contents || '',
        allergensStr,
        ...formatBarcodeExportCells(item)
    ];
};

/**
 * Escape a CSV cell value (handle commas, quotes, newlines)
 */
const escapeCSVCell = (value) => {
    if (value === null || value === undefined) return '';
    let str = String(value);

    // Fix 6.2: CSV Formula Injection Prevention
    if (/^[=+\-@]/.test(str)) {
        str = `'${str}`;
    }

    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

/**
 * Generate CSV content from items with specific template type
 */
const generateCSV = (items, templateType = TEMPLATE_TYPES.MASTER) => {
    const headers = getTemplateHeaders(templateType);
    let csvContent = headers.join(',') + '\n';

    for (const item of items) {
        let row;
        switch (templateType) {
            case TEMPLATE_TYPES.ITEMS:
                row = transformItemToItemsRow(item);
                break;
            case TEMPLATE_TYPES.PRODUCTS:
                row = transformItemToProductsRow(item);
                break;
            default:
                row = transformItemToMasterRow(item);
        }
        const escapedRow = row.map(escapeCSVCell);
        csvContent += escapedRow.join(',') + '\n';
    }

    return csvContent;
};

/**
 * Generate ZIP buffer containing items.csv and products.csv
 */
const generateZipBuffer = async (itemsData, productsData) => {
    return new Promise((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks = [];
        const passThrough = new PassThrough();

        passThrough.on('data', chunk => chunks.push(chunk));
        passThrough.on('end', () => resolve(Buffer.concat(chunks)));
        passThrough.on('error', reject);

        archive.pipe(passThrough);

        // Add items CSV
        const itemsCSV = generateCSV(itemsData, TEMPLATE_TYPES.ITEMS);
        archive.append(itemsCSV, { name: 'items.csv' });

        // Add products CSV
        const productsCSV = generateCSV(productsData, TEMPLATE_TYPES.PRODUCTS);
        archive.append(productsCSV, { name: 'products.csv' });

        archive.finalize();
    });
};

/**
 * Separate items into items and products arrays
 */
const separateItems = (items) => {
    const itemsData = items.filter(i => ITEMS_CATEGORIES.includes(i.category));
    const productsData = items.filter(i => PRODUCTS_CATEGORIES.includes(i.category));
    return { itemsData, productsData };
};

const buildExportPayload = async (items, options = {}) => {
    const workflowMode = shouldUseLegacyExport(options)
        ? null
        : await resolveExportWorkflowMode(options.workflowMode);

    if (workflowMode) {
        const modeCsv = generateModeCSV(items, workflowMode);
        return {
            success: true,
            ...modeCsv,
            count: items.length,
            isZip: false
        };
    }

    const legacyTemplateType = options.templateType;
    if (legacyTemplateType) {
        const csvContent = generateCSV(items, legacyTemplateType);
        return {
            success: true,
            csvContent,
            count: items.length,
            isZip: false,
            templateType: legacyTemplateType
        };
    }

    const { itemsData, productsData } = separateItems(items);

    if (itemsData.length === 0 && productsData.length > 0) {
        const csvContent = generateCSV(productsData, TEMPLATE_TYPES.PRODUCTS);
        return {
            success: true,
            csvContent,
            count: productsData.length,
            isZip: false,
            templateType: TEMPLATE_TYPES.PRODUCTS
        };
    }

    if (productsData.length === 0 && itemsData.length > 0) {
        const csvContent = generateCSV(itemsData, TEMPLATE_TYPES.ITEMS);
        return {
            success: true,
            csvContent,
            count: itemsData.length,
            isZip: false,
            templateType: TEMPLATE_TYPES.ITEMS
        };
    }

    if (itemsData.length === 0 && productsData.length === 0) {
        const csvContent = generateCSV(items, TEMPLATE_TYPES.MASTER);
        return {
            success: true,
            csvContent,
            count: items.length,
            isZip: false,
            templateType: TEMPLATE_TYPES.MASTER
        };
    }

    const zipBuffer = await generateZipBuffer(itemsData, productsData);
    return {
        success: true,
        zipBuffer,
        count: items.length,
        isZip: true,
        itemsCount: itemsData.length,
        productsCount: productsData.length
    };
};

/**
 * Build filter conditions from query parameters
 */
export const buildFilterConditions = async (filters) => {
    const where = buildVisibleWhere({
        status: { [Op.in]: ['active', 'draft'] }
    });

    if (filters.category && filters.category !== 'all') {
        if (filters.category === 'finished_goods' || filters.category === 'work_in_progress') {
            where.category = 'product';
            where.product_type = filters.category;
        } else {
            where.category = filters.category;
        }
    }

    if (filters.search && filters.search.trim()) {
        const searchTerm = `%${filters.search.trim()}%`;
        where[Op.or] = [
            { name: { [Op.like]: searchTerm } },
            { sku_code: { [Op.like]: searchTerm } }
        ];
    }

    if (filters.fifo && filters.fifo !== 'all') {
        if (filters.fifo === 'enabled') {
            where.fifo_enabled = true;
        } else if (filters.fifo === 'disabled') {
            where.fifo_enabled = false;
        }
    }

    if (filters.folder && filters.folder !== 'all') {
        const ItemFolder = dbStore.get('ItemFolder');
        const folderName = String(filters.folder).trim();
        if (folderName) {
            if (!ItemFolder || typeof ItemFolder.findOne !== 'function') {
                // Fail-safe: avoid falling back to legacy product_folder filtering.
                where.item_id = -1;
                return where;
            }

            const folder = await ItemFolder.findOne({
                where: { name: folderName },
                attributes: ['folder_id']
            });

            const resolvedFolderId = folder?.folder_id ?? folder?.get?.('folder_id');
            if (resolvedFolderId !== undefined && resolvedFolderId !== null) {
                where.folder_id = resolvedFolderId;
            } else {
                // Force an empty result when a folder name does not exist.
                where.item_id = -1;
            }
        }
    }

    return where;
};

/**
 * Export items based on filters
 * Returns ZIP if mixed types, or single CSV if uniform types
 */
export const exportFiltered = async (filters = {}, options = {}) => {
    try {
        const where = await buildFilterConditions(filters);
        // Include related tables for complete product data export
        const Item = dbStore.get('Item');
        const items = await Item.findAll({
            where,
            order: [['name', 'ASC']],
            include: getProductExportIncludes()
        });

        if (items.length === 0) {
            return buildExportPayload(items, options);
        }

        return buildExportPayload(items, options);
    } catch (error) {
        console.error('Export filtered error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Export specific items by IDs
 */
export const exportByIds = async (itemIds, options = {}) => {
    try {
        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return { success: false, error: 'No item IDs provided' };
        }

        // Include related tables for complete product data export
        // Include related tables for complete product data export
        const Item = dbStore.get('Item');
        const items = await Item.findAll({
            where: buildVisibleWhere({
                item_id: { [Op.in]: itemIds },
                status: { [Op.in]: ['active', 'draft'] }
            }),
            order: [['name', 'ASC']],
            include: getProductExportIncludes()
        });

        if (items.length === 0) {
            return buildExportPayload(items, options);
        }

        return buildExportPayload(items, options);
    } catch (error) {
        console.error('Export by IDs error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Export all items as ZIP (items.csv + products.csv)
 */
export const exportAll = async (options = {}) => {
    try {
        // Include related tables for complete product data export
        // Include related tables for complete product data export
        const Item = dbStore.get('Item');
        const items = await Item.findAll({
            where: buildVisibleWhere({ status: { [Op.in]: ['active', 'draft'] } }),
            order: [['name', 'ASC']],
            include: getProductExportIncludes()
        });

        if (items.length === 0) {
            return buildExportPayload(items, options);
        }

        return buildExportPayload(items, options);
    } catch (error) {
        console.error('Export all error:', error);
        return { success: false, error: error.message };
    }
};
