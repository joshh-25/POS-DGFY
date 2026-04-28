import { parse } from 'csv-parse'; // Fix 4.3/6.3: async variant, not csv-parse/sync
import { Op } from 'sequelize';
import crypto from 'crypto';
import dbStore from '../utils/dbStore.js';
import { createItemSchema, updateItemSchema } from '../validators/itemValidator.js';
import { createItem, updateItem } from './itemService.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';
import { getAllSettingsUseCase } from '../modules/settings/index.js';
import { unwrapApplicationResultOrThrow } from '../modules/shared/contracts/applicationResultHelpers.js';
import {
    DEFAULT_WORKFLOW_MODE,
    normalizeWorkflowMode,
    resolveWorkflowModeFamily,
    resolveWorkflowTemplateMode
} from '../modules/shared/constants/workflowModes.js';

// Valid values for enums
const VALID_CATEGORIES = ['raw_material', 'packaging', 'product', 'supplies'];
const VALID_PRODUCT_TYPES = ['work_in_progress', 'finished_goods'];
const VALID_VAT_TYPES = ['vatable', 'vat_exempt', 'zero_rated'];
const VALID_ALLERGENS = ['milk', 'eggs', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame'];
const VALID_TEMPLATE_WORKFLOW_MODES = ['manufacturing', 'msme'];
const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const TEMPLATE_SCHEMA_VERSION = 'v1';

/**
 * Parse CSV content and transform rows to item format
 *
 * Fix 4.3/6.3: Previously used csv-parse/sync which blocks the Node.js Event Loop
 * for the entire duration of the parse. With large files (up to 10MB), this causes
 * measurable lag for all other concurrent requests.
 *
 * Solution: async Promise-based parse() — the parser runs via libuv and yields the
 * Event Loop immediately. Signature is unchanged: accepts a string, returns a Promise.
 */
export const parseCSV = (csvContent) => {
    return new Promise((resolve) => {
        parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            cast: false, // Keep as strings, we'll transform manually
            bom: true   // Fix 6.5: Handle UTF-8 Byte Order Mark (e.g. Excel CSV UTF-8)
        }, (err, records) => {
            if (err) {
                resolve({ success: false, error: `CSV parsing error: ${err.message}` });
            } else {
                resolve({ success: true, records });
            }
        });
    });
};


/**
 * Transform a CSV row to item data format
 * Supports all Product Wizard fields including nested objects for related tables
 */
const transformRow = (row) => {
    const item = {};

    // Core fields
    if (row.sku_code) item.sku_code = row.sku_code.trim();
    if (row.name) item.name = row.name.trim();
    if (row.category) item.category = row.category.trim().toLowerCase();
    if (row.product_type) {
        item.product_type = row.product_type.trim().toLowerCase() || null;
    } else {
        item.product_type = null;
    }
    if (row.vat_type) {
        item.vat_type = row.vat_type.trim().toLowerCase() || null;
    } else {
        item.vat_type = null;
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
    if (row.default_sale_price) item.default_sale_price = parseFloat(row.default_sale_price) || null;
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
    if (row.template_workflow_mode) {
        item.template_workflow_mode = String(row.template_workflow_mode || '').trim().toLowerCase();
    }
    if (row.template_schema_version) {
        item.template_schema_version = String(row.template_schema_version || '').trim();
    }
    if (row.template_issued_at) {
        item.template_issued_at = String(row.template_issued_at || '').trim();
    }
    if (row.template_signature) {
        item.template_signature = String(row.template_signature || '').trim();
    }

    // Packaging specs (flattened columns for Items template)
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

    // === PRODUCT WIZARD RELATED TABLE FIELDS ===

    // Allergens (comma-separated) - direct allergens
    if (row.allergens) {
        const allergenList = row.allergens.split(',').map(a => a.trim().toLowerCase()).filter(a => a);
        if (allergenList.length > 0) {
            item.allergens = allergenList;
        }
    }

    // May contain allergens (comma-separated) - cross-contamination allergens
    if (row.may_contain_allergens) {
        const mayContainList = row.may_contain_allergens.split(',').map(a => a.trim().toLowerCase()).filter(a => a);
        if (mayContainList.length > 0) {
            item.may_contain_allergens = mayContainList;
        }
    }

    // Nutritional Info (from nutrition_* columns)
    const nutritionalInfo = {};
    if (row.nutrition_serving_size) nutritionalInfo.serving_size = row.nutrition_serving_size.trim();
    if (row.nutrition_calories) nutritionalInfo.calories = parseFloat(row.nutrition_calories) || null;
    if (row.nutrition_total_fat) nutritionalInfo.total_fat = parseFloat(row.nutrition_total_fat) || null;
    if (row.nutrition_saturated_fat) nutritionalInfo.saturated_fat = parseFloat(row.nutrition_saturated_fat) || null;
    if (row.nutrition_cholesterol) nutritionalInfo.cholesterol = parseFloat(row.nutrition_cholesterol) || null;
    if (row.nutrition_sodium) nutritionalInfo.sodium = parseFloat(row.nutrition_sodium) || null;
    if (row.nutrition_total_carbohydrates) nutritionalInfo.total_carbohydrates = parseFloat(row.nutrition_total_carbohydrates) || null;
    if (row.nutrition_dietary_fiber) nutritionalInfo.dietary_fiber = parseFloat(row.nutrition_dietary_fiber) || null;
    if (row.nutrition_sugars) nutritionalInfo.sugars = parseFloat(row.nutrition_sugars) || null;
    if (row.nutrition_protein) nutritionalInfo.protein = parseFloat(row.nutrition_protein) || null;
    if (Object.keys(nutritionalInfo).length > 0) {
        item.nutritional_info = nutritionalInfo;
    }

    // Physical Properties (from physical_* columns)
    const physicalProperties = {};
    if (row.physical_texture) physicalProperties.texture = row.physical_texture.trim();
    if (row.physical_color) physicalProperties.color = row.physical_color.trim();
    if (row.physical_viscosity) physicalProperties.viscosity = row.physical_viscosity.trim();
    if (row.physical_ph_level) physicalProperties.ph_level = parseFloat(row.physical_ph_level) || null;
    if (row.physical_water_activity) physicalProperties.water_activity = parseFloat(row.physical_water_activity) || null;
    if (Object.keys(physicalProperties).length > 0) {
        item.physical_properties = physicalProperties;
    }

    // Extended Shelf Life (from shelf_* columns)
    const shelfLife = {};
    if (row.shelf_storage_temperature) shelfLife.storage_temperature = row.shelf_storage_temperature.trim().toLowerCase();
    if (row.shelf_storage_conditions) shelfLife.storage_conditions = row.shelf_storage_conditions.trim();
    if (Object.keys(shelfLife).length > 0) {
        item.shelf_life = shelfLife;
    }

    // Packaging Info (from packaging_* columns for Products template)
    const packagingInfo = {};
    if (row.packaging_primary) packagingInfo.primary_packaging = row.packaging_primary.trim();
    if (row.packaging_secondary) packagingInfo.secondary_packaging = row.packaging_secondary.trim();
    if (row.packaging_material) packagingInfo.packaging_material = row.packaging_material.trim();
    if (row.packaging_net_weight) packagingInfo.net_weight = row.packaging_net_weight.trim();
    if (row.packaging_label_compliance !== undefined && row.packaging_label_compliance !== '') {
        packagingInfo.label_compliance = row.packaging_label_compliance.toLowerCase() === 'true' || row.packaging_label_compliance === '1';
    }
    if (Object.keys(packagingInfo).length > 0) {
        item.packaging_info = packagingInfo;
    }

    // Cost Breakdown (from cost_* columns)
    if (row.cost_labor) item.labor_cost = parseFloat(row.cost_labor) || null;
    if (row.cost_overhead) item.overhead_cost = parseFloat(row.cost_overhead) || null;
    if (row.cost_additional_packaging) item.additional_packaging_cost = parseFloat(row.cost_additional_packaging) || null;

    // Quality Control (from qc_* columns)
    const qualityControl = {};
    if (row.qc_test_frequency) qualityControl.test_frequency = row.qc_test_frequency.trim().toLowerCase();
    if (row.qc_sampling_plan) qualityControl.sampling_plan = row.qc_sampling_plan.trim();
    if (row.qc_acceptance_criteria) qualityControl.acceptance_criteria = row.qc_acceptance_criteria.trim();
    if (row.qc_corrective_actions) qualityControl.corrective_actions = row.qc_corrective_actions.trim();
    if (Object.keys(qualityControl).length > 0) {
        item.quality_control = qualityControl;
    }

    // Regulatory Compliance (from compliance_* columns)
    const regulatoryCompliance = {};
    const complianceBoolFields = [
        ['compliance_fda_approved', 'fda_approved'],
        ['compliance_gmp_compliant', 'gmp_compliant'],
        ['compliance_haccp_plan', 'haccp_plan'],
        ['compliance_organic_certified', 'organic_certified'],
        ['compliance_kosher_certified', 'kosher_certified'],
        ['compliance_halal_certified', 'halal_certified']
    ];
    for (const [csvField, dbField] of complianceBoolFields) {
        if (row[csvField] !== undefined && row[csvField] !== '') {
            regulatoryCompliance[dbField] = row[csvField].toLowerCase() === 'true' || row[csvField] === '1';
        }
    }
    if (Object.keys(regulatoryCompliance).length > 0) {
        item.regulatory_compliance = regulatoryCompliance;
    }

    return item;
};

const normalizeSkuLookupKey = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized || null;
};

/**
 * Validate a single item and check for existing SKU
 */
const validateItem = async (itemData, rowIndex, existingSkus) => {
    const errors = [];
    let action = 'CREATE';
    let existingItemId = null;

    // Check if SKU already exists
    const skuLookupKey = normalizeSkuLookupKey(itemData.sku_code);
    if (skuLookupKey && existingSkus.has(skuLookupKey)) {
        action = 'UPDATE';
        existingItemId = existingSkus.get(skuLookupKey);
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
    if (itemData.vat_type && !VALID_VAT_TYPES.includes(itemData.vat_type)) {
        errors.push(`Invalid vat_type: ${itemData.vat_type}. Must be one of: ${VALID_VAT_TYPES.join(', ')}`);
    }
    if (
        itemData.category === 'product'
        && itemData.product_type === 'finished_goods'
        && !itemData.vat_type
    ) {
        errors.push('vat_type is required for finished_goods products');
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

const resolveTenantWorkflowMode = async () => {
    const settings = unwrapApplicationResultOrThrow(
        await getAllSettingsUseCase(),
        'Failed to retrieve settings for workflow-mode validation'
    );
    return normalizeWorkflowMode(settings?.[WORKFLOW_MODE_SETTING_KEY]?.value ?? DEFAULT_WORKFLOW_MODE);
};

const resolveTenantTemplateWorkflowMode = (workflowMode) => resolveWorkflowTemplateMode(workflowMode);

const normalizeTemplateWorkflowMode = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (VALID_TEMPLATE_WORKFLOW_MODES.includes(normalized)) {
        return normalized;
    }
    return null;
};

const getTemplateSigningSecret = () => (
    process.env.CSV_TEMPLATE_SIGNING_SECRET
    || process.env.JWT_SECRET
    || 'csv-template-signing-secret'
);

const buildTemplateSignature = ({ workflowMode, schemaVersion, issuedAt }) => {
    const payload = `${String(workflowMode || '').trim().toLowerCase()}|${String(schemaVersion || '').trim()}|${String(issuedAt || '').trim()}`;
    return crypto
        .createHmac('sha256', getTemplateSigningSecret())
        .update(payload)
        .digest('hex');
};

const resolveTemplateMetadataFromRecords = (headers = [], records = []) => {
    const normalizedHeaders = headers.map((header) => String(header || '').trim().toLowerCase());
    const hasModeMarker = normalizedHeaders.includes('template_workflow_mode');
    const hasSignatureMarkers = normalizedHeaders.includes('template_signature')
        && normalizedHeaders.includes('template_schema_version')
        && normalizedHeaders.includes('template_issued_at');

    if (hasModeMarker) {
        for (const record of records) {
            const marker = normalizeTemplateWorkflowMode(record?.template_workflow_mode);
            if (!marker) continue;

            const schemaVersion = String(record?.template_schema_version || '').trim();
            const issuedAt = String(record?.template_issued_at || '').trim();
            const signature = String(record?.template_signature || '').trim();
            const expectedSignature = buildTemplateSignature({
                workflowMode: marker,
                schemaVersion,
                issuedAt
            });

            if (hasSignatureMarkers) {
                if (!schemaVersion || !issuedAt || !signature) {
                    return {
                        workflowMode: marker,
                        signatureValid: false,
                        reason: 'missing_signature_markers',
                        schemaVersion,
                        issuedAt
                    };
                }

                if (signature !== expectedSignature) {
                    return {
                        workflowMode: marker,
                        signatureValid: false,
                        reason: 'signature_mismatch',
                        schemaVersion,
                        issuedAt
                    };
                }
            }

            return {
                workflowMode: marker,
                signatureValid: true,
                reason: hasSignatureMarkers ? 'signed' : 'legacy_unsigned',
                schemaVersion,
                issuedAt
            };
        }
    }

    // Backwards compatibility fallback:
    // unmarked templates are treated as manufacturing-oriented.
    return {
        workflowMode: 'manufacturing',
        signatureValid: true,
        reason: 'legacy_unmarked',
        schemaVersion: '',
        issuedAt: ''
    };
};

const inferTemplateMetadataFromRows = (rows = []) => {
    for (const row of rows) {
        const rowMarker = normalizeTemplateWorkflowMode(row?.template_workflow_mode || row?.data?.template_workflow_mode);
        if (!rowMarker) continue;

        const schemaVersion = String(row?.template_schema_version || row?.data?.template_schema_version || '').trim();
        const issuedAt = String(row?.template_issued_at || row?.data?.template_issued_at || '').trim();
        const signature = String(row?.template_signature || row?.data?.template_signature || '').trim();
        const expectedSignature = buildTemplateSignature({
            workflowMode: rowMarker,
            schemaVersion,
            issuedAt
        });

        if (schemaVersion || issuedAt || signature) {
            if (!schemaVersion || !issuedAt || !signature) {
                return {
                    workflowMode: rowMarker,
                    signatureValid: false,
                    reason: 'missing_signature_markers',
                    schemaVersion,
                    issuedAt
                };
            }

            if (signature !== expectedSignature) {
                return {
                    workflowMode: rowMarker,
                    signatureValid: false,
                    reason: 'signature_mismatch',
                    schemaVersion,
                    issuedAt
                };
            }
        }

        return {
            workflowMode: rowMarker,
            signatureValid: true,
            reason: signature ? 'signed' : 'legacy_unsigned',
            schemaVersion,
            issuedAt
        };
    }

    // Backwards compatibility fallback:
    // unmarked templates are treated as manufacturing-oriented.
    return {
        workflowMode: 'manufacturing',
        signatureValid: true,
        reason: 'legacy_unmarked',
        schemaVersion: '',
        issuedAt: ''
    };
};

const buildWorkflowMismatchMessage = ({
    templateWorkflowMode,
    tenantWorkflowMode,
    tenantWorkflowModeFamily,
    tenantTemplateWorkflowMode
}) => (
    `Template workflow mode '${templateWorkflowMode}' is not compatible with tenant workflow mode '${tenantWorkflowMode}' `
    + `(mode family '${tenantWorkflowModeFamily}'). Download the '${tenantTemplateWorkflowMode}' CSV template and try again.`
);

/**
 * Preview CSV import - validate all rows and return preview data
 */
export const previewImport = async (csvContent) => {
    // Parse CSV
    const parseResult = await parseCSV(csvContent);
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
    const templateMetadata = resolveTemplateMetadataFromRecords(headers, records);
    const templateWorkflowMode = templateMetadata.workflowMode;
    const tenantWorkflowMode = await resolveTenantWorkflowMode();
    const tenantWorkflowModeFamily = resolveWorkflowModeFamily(tenantWorkflowMode);
    const tenantTemplateWorkflowMode = resolveTenantTemplateWorkflowMode(tenantWorkflowMode);

    if (!templateMetadata.signatureValid) {
        return {
            success: false,
            error: 'CSV template signature is invalid or missing required signature markers. Download a fresh template and retry.',
            details: {
                code: 'TEMPLATE_SIGNATURE_INVALID',
                reason: templateMetadata.reason,
                template_workflow_mode: templateWorkflowMode,
                tenant_workflow_mode: tenantWorkflowMode,
                tenant_workflow_mode_family: tenantWorkflowModeFamily,
                tenant_template_workflow_mode: tenantTemplateWorkflowMode
            }
        };
    }

    if (templateWorkflowMode !== tenantTemplateWorkflowMode) {
        return {
            success: false,
            error: buildWorkflowMismatchMessage({
                templateWorkflowMode,
                tenantWorkflowMode,
                tenantWorkflowModeFamily,
                tenantTemplateWorkflowMode
            }),
            details: {
                code: 'WORKFLOW_MODE_TEMPLATE_MISMATCH',
                template_workflow_mode: templateWorkflowMode,
                tenant_workflow_mode: tenantWorkflowMode,
                tenant_workflow_mode_family: tenantWorkflowModeFamily,
                tenant_template_workflow_mode: tenantTemplateWorkflowMode,
                remediation: `Use the ${tenantTemplateWorkflowMode} CSV template for this tenant before importing.`
            }
        };
    }

    // Get all existing SKUs for upsert detection
    const Item = dbStore.get('Item');
    const existingItems = await Item.findAll({
        attributes: ['item_id', 'sku_code'],
        where: buildVisibleWhere({ status: { [Op.in]: ['active', 'draft'] } })
    });
    const existingSkus = new Map(
        existingItems
            .map((item) => [normalizeSkuLookupKey(item.sku_code), item.item_id])
            .filter(([skuKey]) => Boolean(skuKey))
    );
    const seenSkuRows = new Map();

    // Transform and validate each row
    const previewRows = [];
    let validCount = 0;
    let createCount = 0;
    let updateCount = 0;

    for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const itemData = transformRow(row);
        const validation = await validateItem(itemData, i + 1, existingSkus);
        const skuLookupKey = normalizeSkuLookupKey(itemData.sku_code);
        if (skuLookupKey) {
            if (seenSkuRows.has(skuLookupKey)) {
                validation.valid = false;
                validation.errors.push(`Duplicate SKU code in import file (first seen on row ${seenSkuRows.get(skuLookupKey)})`);
            } else {
                seenSkuRows.set(skuLookupKey, i + 1);
            }
        }

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
            template_workflow_mode: templateWorkflowMode,
            action: validation.action,
            valid: validation.valid,
            errors: validation.errors,
            data: {
                ...validation.data,
                template_workflow_mode: templateWorkflowMode,
                ...(templateMetadata.schemaVersion ? { template_schema_version: templateMetadata.schemaVersion } : {}),
                ...(templateMetadata.issuedAt ? { template_issued_at: templateMetadata.issuedAt } : {}),
                ...(
                    templateMetadata.schemaVersion && templateMetadata.issuedAt
                        ? {
                            template_signature: buildTemplateSignature({
                                workflowMode: templateWorkflowMode,
                                schemaVersion: templateMetadata.schemaVersion,
                                issuedAt: templateMetadata.issuedAt
                            })
                        }
                        : {}
                )
            },
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
        templateWorkflowMode,
        tenantWorkflowMode,
        tenantWorkflowModeFamily,
        tenantTemplateWorkflowMode,
        templateSchemaVersion: templateMetadata.schemaVersion || null,
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
 * For products, uses itemService to properly save related data (nutrition, compliance, etc.)
 * 
 * OPTIMIZED: Uses batch processing for better performance with large imports (up to 1000 items)
 * - Simple items (raw_material, packaging, supplies): bulkCreate with upsert
 * - Products: Concurrent batch processing (10 at a time)
 */
export const confirmImport = async (rows, userId) => {
    const results = {
        created: [],
        updated: [],
        failed: []
    };

    if (!rows || !Array.isArray(rows)) {
        return { success: false, error: 'Invalid rows data provided' };
    }

    const templateMetadata = inferTemplateMetadataFromRows(rows);
    const templateWorkflowMode = templateMetadata.workflowMode;
    const tenantWorkflowMode = await resolveTenantWorkflowMode();
    const tenantWorkflowModeFamily = resolveWorkflowModeFamily(tenantWorkflowMode);
    const tenantTemplateWorkflowMode = resolveTenantTemplateWorkflowMode(tenantWorkflowMode);
    if (!templateMetadata.signatureValid) {
        return {
            success: false,
            error: 'CSV template signature is invalid or missing required signature markers. Download a fresh template and retry.',
            details: {
                code: 'TEMPLATE_SIGNATURE_INVALID',
                reason: templateMetadata.reason,
                template_workflow_mode: templateWorkflowMode,
                tenant_workflow_mode: tenantWorkflowMode,
                tenant_workflow_mode_family: tenantWorkflowModeFamily,
                tenant_template_workflow_mode: tenantTemplateWorkflowMode
            }
        };
    }

    if (templateWorkflowMode !== tenantTemplateWorkflowMode) {
        return {
            success: false,
            error: buildWorkflowMismatchMessage({
                templateWorkflowMode,
                tenantWorkflowMode,
                tenantWorkflowModeFamily,
                tenantTemplateWorkflowMode
            }),
            details: {
                code: 'WORKFLOW_MODE_TEMPLATE_MISMATCH',
                template_workflow_mode: templateWorkflowMode,
                tenant_workflow_mode: tenantWorkflowMode,
                tenant_workflow_mode_family: tenantWorkflowModeFamily,
                tenant_template_workflow_mode: tenantTemplateWorkflowMode,
                remediation: `Use the ${tenantTemplateWorkflowMode} CSV template for this tenant before importing.`
            }
        };
    }

    // Get all existing SKUs for re-validation for efficiency
    const Item = dbStore.get('Item');
    const existingItems = await Item.findAll({
        attributes: ['item_id', 'sku_code'],
        where: buildVisibleWhere({ status: { [Op.in]: ['active', 'draft'] } })
    });
    const existingSkus = new Map(
        existingItems
            .map((item) => [normalizeSkuLookupKey(item.sku_code), item.item_id])
            .filter(([skuKey]) => Boolean(skuKey))
    );
    const seenSkuRows = new Map();

    // Re-validate and sanitize all rows on the backend
    const validRows = [];
    for (const row of rows) {
        // Fix 6.1: RE-VALIDATE everything on the backend.
        // Even if client says it is valid, we don't trust it.
        const validation = await validateItem(row.data, row.rowNumber, existingSkus);
        const skuLookupKey = normalizeSkuLookupKey(row.data?.sku_code);
        if (skuLookupKey) {
            if (seenSkuRows.has(skuLookupKey)) {
                validation.valid = false;
                validation.errors.push(`Duplicate SKU code in import file (first seen on row ${seenSkuRows.get(skuLookupKey)})`);
            } else {
                seenSkuRows.set(skuLookupKey, row.rowNumber);
            }
        }

        if (!validation.valid) {
            results.failed.push({
                rowNumber: row.rowNumber,
                sku_code: row.sku_code || (row.data && row.data.sku_code) || 'Unknown',
                errors: validation.errors
            });
        } else {
            // Use the backend-validated and sanitized data
            validRows.push({
                ...row,
                data: validation.data,
                action: validation.action,
                existingItemId: validation.existingItemId
            });
        }
    }

    // Separate by category type
    const simpleItems = validRows.filter(r => r.data.category !== 'product');
    const productItems = validRows.filter(r => r.data.category === 'product');

    // === BATCH 1: Process simple items (raw_material, packaging, supplies) ===
    // These can use bulkCreate for much better performance
    if (simpleItems.length > 0) {
        const sequelize = dbStore.get('sequelize');

        // Separate creates and updates
        const toCreate = simpleItems.filter(r => r.action === 'CREATE');
        const toUpdate = simpleItems.filter(r => r.action === 'UPDATE');

        // Bulk CREATE simple items
        if (toCreate.length > 0) {
            const BATCH_SIZE = 50;
            for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
                const batch = toCreate.slice(i, i + BATCH_SIZE);
                const transaction = await sequelize.transaction();
                try {
                    const itemsData = batch.map(r => ({
                        ...r.data,
                        status: 'active'
                    }));

                    const createdItems = await Item.bulkCreate(itemsData, {
                        transaction,
                        returning: true,
                        validate: true // Fix 6.1: Enforce model validations during bulk import
                    });
                    await transaction.commit();

                    // Map results back to rows
                    createdItems.forEach((item, idx) => {
                        results.created.push({
                            rowNumber: batch[idx].rowNumber,
                            item_id: item.item_id,
                            sku_code: item.sku_code,
                            name: item.name
                        });
                    });
                } catch (err) {
                    await transaction.rollback();
                    // If bulk fails, mark all in batch as failed
                    batch.forEach(r => {
                        results.failed.push({
                            rowNumber: r.rowNumber,
                            sku_code: r.sku_code,
                            errors: [`Batch insert failed: ${err.message}`]
                        });
                    });
                }
            }
        }

        // UPDATE simple items (still one-by-one but concurrent)
        if (toUpdate.length > 0) {
            const CONCURRENCY = 10;
            for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
                const batch = toUpdate.slice(i, i + CONCURRENCY);
                const promises = batch.map(async (row) => {
                    const transaction = await sequelize.transaction();
                    try {
                        await Item.update(row.data, {
                            where: buildVisibleWhere({
                                item_id: row.existingItemId,
                                status: { [Op.in]: ['active', 'draft'] }
                            }),
                            transaction,
                            validate: true // Ensure updates are also validated
                        });
                        await transaction.commit();
                        return { success: true, row };
                    } catch (err) {
                        await transaction.rollback();
                        return { success: false, row, error: err.message };
                    }
                });

                const batchResults = await Promise.allSettled(promises);
                for (const result of batchResults) {
                    if (result.status === 'fulfilled' && result.value.success) {
                        results.updated.push({
                            rowNumber: result.value.row.rowNumber,
                            item_id: result.value.row.existingItemId,
                            sku_code: result.value.row.sku_code,
                            name: result.value.row.data.name
                        });
                    } else {
                        const row = result.status === 'fulfilled' ? result.value.row : null;
                        const errorMsg = result.status === 'fulfilled' ? result.value.error : result.reason?.message;
                        if (row) {
                            results.failed.push({
                                rowNumber: row.rowNumber,
                                sku_code: row.sku_code,
                                errors: [errorMsg || 'Unknown error']
                            });
                        }
                    }
                }
            }
        }
    }

    // === BATCH 2: Process products (need itemService for related tables) ===
    // These use itemService which handles nutrition, allergens, etc.
    if (productItems.length > 0) {
        const CONCURRENCY = 10;

        for (let i = 0; i < productItems.length; i += CONCURRENCY) {
            const batch = productItems.slice(i, i + CONCURRENCY);
            const promises = batch.map(async (row) => {
                try {
                    if (row.action === 'CREATE') {
                        const newItem = await createItem({
                            ...row.data,
                            status: 'active'
                        }, userId);
                        return {
                            success: true,
                            action: 'CREATE',
                            row,
                            item: newItem
                        };
                    } else {
                        await updateItem(row.existingItemId, row.data, userId);
                        return {
                            success: true,
                            action: 'UPDATE',
                            row
                        };
                    }
                } catch (err) {
                    return { success: false, row, error: err.message };
                }
            });

            const batchResults = await Promise.allSettled(promises);
            for (const result of batchResults) {
                if (result.status === 'fulfilled' && result.value.success) {
                    const { action, row, item } = result.value;
                    if (action === 'CREATE') {
                        results.created.push({
                            rowNumber: row.rowNumber,
                            item_id: item.item_id,
                            sku_code: item.sku_code,
                            name: item.name
                        });
                    } else {
                        results.updated.push({
                            rowNumber: row.rowNumber,
                            item_id: row.existingItemId,
                            sku_code: row.sku_code,
                            name: row.data.name
                        });
                    }
                } else {
                    const row = result.status === 'fulfilled' ? result.value.row : null;
                    const errorMsg = result.status === 'fulfilled' ? result.value.error : result.reason?.message;
                    if (row) {
                        results.failed.push({
                            rowNumber: row.rowNumber,
                            sku_code: row.sku_code,
                            errors: [errorMsg || 'Unknown error']
                        });
                    }
                }
            }
        }
    }

    return {
        success: true,
        createdCount: results.created.length,
        updatedCount: results.updated.length,
        failedCount: results.failed.length,
        results
    };
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
// Includes all fields from related tables: nutrition, allergens, physical properties,
// shelf life, packaging, quality control, regulatory compliance, cost breakdown
export const PRODUCTS_HEADERS = [
    // Core fields (from items table)
    'sku_code',
    'name',
    'category',
    'product_type',
    'vat_type',
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
    'production_notes',

    // Nutritional Info (from item_nutrition table)
    'nutrition_serving_size',
    'nutrition_calories',
    'nutrition_total_fat',
    'nutrition_saturated_fat',
    'nutrition_cholesterol',
    'nutrition_sodium',
    'nutrition_total_carbohydrates',
    'nutrition_dietary_fiber',
    'nutrition_sugars',
    'nutrition_protein',

    // Allergens (from item_allergens table - comma-separated)
    'allergens',
    'may_contain_allergens',

    // Physical Properties (from item_physical_properties table)
    'physical_texture',
    'physical_color',
    'physical_viscosity',
    'physical_ph_level',
    'physical_water_activity',

    // Extended Shelf Life (from item_shelf_life table)
    'shelf_storage_temperature',
    'shelf_storage_conditions',

    // Packaging Info (from item_packaging table)
    'packaging_primary',
    'packaging_secondary',
    'packaging_material',
    'packaging_net_weight',
    'packaging_label_compliance',

    // Cost Breakdown (from item_cost_breakdown table)
    'cost_labor',
    'cost_overhead',
    'cost_additional_packaging',

    // Quality Control (from item_quality_control table)
    'qc_test_frequency',
    'qc_sampling_plan',
    'qc_acceptance_criteria',
    'qc_corrective_actions',

    // Regulatory Compliance (from item_regulatory_compliance table)
    'compliance_fda_approved',
    'compliance_gmp_compliant',
    'compliance_haccp_plan',
    'compliance_organic_certified',
    'compliance_kosher_certified',
    'compliance_halal_certified'
];

const TEMPLATE_MARKER_HEADERS = Object.freeze([
    'template_workflow_mode',
    'mode_compatibility_note',
    'template_schema_version',
    'template_issued_at',
    'template_signature'
]);

export const MANUFACTURING_TEMPLATE_HEADERS = Object.freeze([
    'sku_code',
    'name',
    'category',
    'product_type',
    'vat_type',
    'description',
    'product_folder',
    'max_capacity',
    'current_stock',
    'min_threshold',
    'purchase_allowance',
    'unit_of_measure',
    'cost_per_unit',
    'default_sale_price',
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
    'allergens',
    ...TEMPLATE_MARKER_HEADERS
]);

export const MSME_TEMPLATE_HEADERS = Object.freeze([
    'sku_code',
    'name',
    'category',
    'product_type',
    'vat_type',
    'description',
    'max_capacity',
    'current_stock',
    'min_threshold',
    'purchase_allowance',
    'unit_of_measure',
    'cost_per_unit',
    'default_sale_price',
    'fifo_enabled',
    'shelf_life_days',
    'opened_shelf_life_days',
    'packaging_height',
    'packaging_width',
    'packaging_thickness',
    'packaging_material',
    'packaging_design',
    'packaging_contents',
    'allergens',
    ...TEMPLATE_MARKER_HEADERS
]);

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

export const resolveRequestedTemplateWorkflowMode = ({ workflowMode, templateType }) => {
    const normalizedMode = normalizeTemplateWorkflowMode(workflowMode);
    if (normalizedMode) return normalizedMode;

    const hasWorkflowModeInput = workflowMode !== undefined
        && workflowMode !== null
        && String(workflowMode).trim() !== '';
    if (hasWorkflowModeInput) {
        return resolveWorkflowTemplateMode(workflowMode);
    }

    // Backwards compatibility:
    // legacy callers that only pass `type` map to manufacturing templates.
    if (templateType) {
        return 'manufacturing';
    }

    return 'manufacturing';
};

const getTemplateCompatibilityNote = (workflowMode) => (
    workflowMode === 'msme'
        ? 'This CSV template is for Simple (MSME) mode family only. It will be rejected for manufacturing-family modes.'
        : 'This CSV template is for manufacturing-family modes only. It will be rejected for Simple (MSME) mode.'
);

const appendTemplateMarkersToRows = (rows, workflowMode) => {
    const note = getTemplateCompatibilityNote(workflowMode);
    const schemaVersion = TEMPLATE_SCHEMA_VERSION;
    const issuedAt = new Date().toISOString();
    const signature = buildTemplateSignature({ workflowMode, schemaVersion, issuedAt });
    return rows.map((row) => [
        ...row,
        workflowMode,
        note,
        schemaVersion,
        issuedAt,
        signature
    ]);
};

export const getTemplateDefinition = ({ workflowMode, templateType } = {}) => {
    const resolvedWorkflowMode = resolveRequestedTemplateWorkflowMode({ workflowMode, templateType });

    if (resolvedWorkflowMode === 'msme') {
        return {
            workflowMode: resolvedWorkflowMode,
            filename: 'msme_items_import_template.csv',
            headers: [...MSME_TEMPLATE_HEADERS],
            sampleRows: appendTemplateMarkersToRows([
                ['MSME-PROD-001', 'Chocolate Cookies Pack', 'product', 'finished_goods', 'vatable', 'Retail-ready cookies', '120', '40', '20', '10', 'pack', '65.00', '95.00', 'TRUE', '60', '20', '12', '8', '0.05', 'plastic', 'Retail pouch', '10 pcs', 'wheat,milk'],
                ['MSME-SUP-001', 'Paper Bag Medium', 'supplies', '', '', 'Takeout packaging bag', '500', '180', '75', '30', 'pcs', '4.50', '8.00', 'FALSE', '', '', '12', '6', '0.01', 'paper', 'Brown kraft', '1 bag', '']
            ], resolvedWorkflowMode)
        };
    }

    return {
        workflowMode: resolvedWorkflowMode,
        filename: 'manufacturing_items_import_template.csv',
        headers: [...MANUFACTURING_TEMPLATE_HEADERS],
        sampleRows: appendTemplateMarkersToRows([
            ['RM-001', 'Flour - All Purpose', 'raw_material', '', '', 'High quality wheat flour', '', '1000', '500', '100', '50', 'kg', '45.00', '70.00', 'TRUE', '365', '30', '', '', '', '', '', '', '', '', '', 'wheat'],
            ['PKG-001', 'Cake Box - 8 inch', 'packaging', '', '', 'Standard cake box', '', '500', '250', '50', '25', 'pcs', '15.00', '25.00', 'FALSE', '', '', '', '', '', '', '8', '8', '4', 'Cardboard', 'White with logo', '1 cake', ''],
            ['FG-001', 'Chocolate Cake 8inch', 'product', 'finished_goods', 'vatable', 'Premium chocolate cake', 'Cakes', '50', '10', '10', '5', 'pcs', '450.00', '680.00', 'TRUE', '5', '2', '1', '95', '5', 'Store in cool place', '', '', '', '', '', 'milk,eggs,wheat']
        ], resolvedWorkflowMode)
    };
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
                'vat_type',
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
