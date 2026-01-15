import { Op } from 'sequelize';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import Item from '../models/Item.js';
import {
    getTemplateHeaders,
    ITEMS_HEADERS,
    PRODUCTS_HEADERS,
    ITEMS_CATEGORIES,
    PRODUCTS_CATEGORIES,
    TEMPLATE_TYPES
} from './csvImportService.js';

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
        packagingSpecs.contents || ''
    ];
};

/**
 * Transform an Item to a CSV row for Products template
 */
const transformItemToProductsRow = (item) => {
    return [
        item.sku_code || '',
        item.name || '',
        item.category || '',
        item.product_type || '',
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
        item.production_notes || ''
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
        allergensStr
    ];
};

/**
 * Escape a CSV cell value (handle commas, quotes, newlines)
 */
const escapeCSVCell = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
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
 * Determine if items are mixed (contains both items and products)
 */
const isMixedExport = (items) => {
    let hasItems = false;
    let hasProducts = false;

    for (const item of items) {
        if (ITEMS_CATEGORIES.includes(item.category)) {
            hasItems = true;
        }
        if (PRODUCTS_CATEGORIES.includes(item.category)) {
            hasProducts = true;
        }
        if (hasItems && hasProducts) return true;
    }

    return hasItems && hasProducts;
};

/**
 * Separate items into items and products arrays
 */
const separateItems = (items) => {
    const itemsData = items.filter(i => ITEMS_CATEGORIES.includes(i.category));
    const productsData = items.filter(i => PRODUCTS_CATEGORIES.includes(i.category));
    return { itemsData, productsData };
};

/**
 * Build filter conditions from query parameters
 */
const buildFilterConditions = (filters) => {
    const where = {
        status: { [Op.in]: ['active', 'draft'] }
    };

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
        where.product_folder = filters.folder;
    }

    return where;
};

/**
 * Export items based on filters
 * Returns ZIP if mixed types, or single CSV if uniform types
 */
export const exportFiltered = async (filters = {}) => {
    try {
        const where = buildFilterConditions(filters);
        const items = await Item.findAll({ where, order: [['name', 'ASC']] });

        if (items.length === 0) {
            return { success: true, csvContent: '', count: 0, isZip: false };
        }

        // Check if mixed types (would need ZIP)
        if (isMixedExport(items)) {
            const { itemsData, productsData } = separateItems(items);
            const zipBuffer = await generateZipBuffer(itemsData, productsData);
            return {
                success: true,
                zipBuffer,
                count: items.length,
                isZip: true,
                itemsCount: itemsData.length,
                productsCount: productsData.length
            };
        }

        // Single type - determine which template to use
        const isProducts = items.every(i => PRODUCTS_CATEGORIES.includes(i.category));
        const templateType = isProducts ? TEMPLATE_TYPES.PRODUCTS : TEMPLATE_TYPES.ITEMS;
        const csvContent = generateCSV(items, templateType);

        return {
            success: true,
            csvContent,
            count: items.length,
            isZip: false,
            templateType
        };
    } catch (error) {
        console.error('Export filtered error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Export specific items by IDs
 */
export const exportByIds = async (itemIds) => {
    try {
        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return { success: false, error: 'No item IDs provided' };
        }

        const items = await Item.findAll({
            where: {
                item_id: { [Op.in]: itemIds },
                status: { [Op.in]: ['active', 'draft'] }
            },
            order: [['name', 'ASC']]
        });

        if (items.length === 0) {
            return { success: true, csvContent: '', count: 0, isZip: false };
        }

        // Check if mixed types
        if (isMixedExport(items)) {
            const { itemsData, productsData } = separateItems(items);
            const zipBuffer = await generateZipBuffer(itemsData, productsData);
            return {
                success: true,
                zipBuffer,
                count: items.length,
                isZip: true,
                itemsCount: itemsData.length,
                productsCount: productsData.length
            };
        }

        // Single type
        const isProducts = items.every(i => PRODUCTS_CATEGORIES.includes(i.category));
        const templateType = isProducts ? TEMPLATE_TYPES.PRODUCTS : TEMPLATE_TYPES.ITEMS;
        const csvContent = generateCSV(items, templateType);

        return {
            success: true,
            csvContent,
            count: items.length,
            isZip: false,
            templateType
        };
    } catch (error) {
        console.error('Export by IDs error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Export all items as ZIP (items.csv + products.csv)
 */
export const exportAll = async () => {
    try {
        const items = await Item.findAll({
            where: { status: { [Op.in]: ['active', 'draft'] } },
            order: [['name', 'ASC']]
        });

        if (items.length === 0) {
            return { success: true, csvContent: '', count: 0, isZip: false };
        }

        const { itemsData, productsData } = separateItems(items);

        // If only one type exists, return single CSV
        if (itemsData.length === 0 && productsData.length > 0) {
            const csvContent = generateCSV(productsData, TEMPLATE_TYPES.PRODUCTS);
            return { success: true, csvContent, count: productsData.length, isZip: false, templateType: TEMPLATE_TYPES.PRODUCTS };
        }
        if (productsData.length === 0 && itemsData.length > 0) {
            const csvContent = generateCSV(itemsData, TEMPLATE_TYPES.ITEMS);
            return { success: true, csvContent, count: itemsData.length, isZip: false, templateType: TEMPLATE_TYPES.ITEMS };
        }

        // Both types exist - generate ZIP
        const zipBuffer = await generateZipBuffer(itemsData, productsData);
        return {
            success: true,
            zipBuffer,
            count: items.length,
            isZip: true,
            itemsCount: itemsData.length,
            productsCount: productsData.length
        };
    } catch (error) {
        console.error('Export all error:', error);
        return { success: false, error: error.message };
    }
};
