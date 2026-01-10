import { Op } from 'sequelize';
import Item from '../models/Item.js';
import { getTemplateHeaders } from './csvImportService.js';

/**
 * Transform an Item model instance to a CSV row array
 * Matches the exact column order from getTemplateHeaders()
 */
const transformItemToRow = (item) => {
    // Extract packaging_specs fields
    const packagingSpecs = item.packaging_specs || {};

    // Convert allergens array to comma-separated string
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
    // If contains comma, quote, or newline, wrap in quotes and escape existing quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

/**
 * Generate CSV content from items
 */
const generateCSV = (items) => {
    const headers = getTemplateHeaders();

    // Build CSV content
    let csvContent = headers.join(',') + '\n';

    for (const item of items) {
        const row = transformItemToRow(item);
        const escapedRow = row.map(escapeCSVCell);
        csvContent += escapedRow.join(',') + '\n';
    }

    return csvContent;
};

/**
 * Build filter conditions from query parameters
 */
const buildFilterConditions = (filters) => {
    const where = {
        status: { [Op.in]: ['active', 'draft'] } // Exclude inactive/deleted items
    };

    // Category filter
    if (filters.category && filters.category !== 'all') {
        // Handle product subtypes
        if (filters.category === 'finished_goods' || filters.category === 'work_in_progress') {
            where.category = 'product';
            where.product_type = filters.category;
        } else {
            where.category = filters.category;
        }
    }

    // Status filter (stock status - we can't filter by computed status at DB level)
    // This will be handled post-query if needed

    // Search filter
    if (filters.search && filters.search.trim()) {
        const searchTerm = `%${filters.search.trim()}%`;
        where[Op.or] = [
            { name: { [Op.like]: searchTerm } },
            { sku_code: { [Op.like]: searchTerm } }
        ];
    }

    // FIFO filter
    if (filters.fifo && filters.fifo !== 'all') {
        if (filters.fifo === 'enabled') {
            where.fifo_enabled = true;
        } else if (filters.fifo === 'disabled') {
            where.fifo_enabled = false;
        }
        // 'expiring' filter would need post-query processing with batches
    }

    // Folder filter (for products)
    if (filters.folder && filters.folder !== 'all') {
        where.product_folder = filters.folder;
    }

    return where;
};

/**
 * Export items based on filters
 * @param {Object} filters - Filter criteria (category, search, fifo, folder)
 * @returns {Object} - { success: boolean, csvContent: string, count: number }
 */
export const exportFiltered = async (filters = {}) => {
    try {
        const where = buildFilterConditions(filters);

        const items = await Item.findAll({
            where,
            order: [['name', 'ASC']]
        });

        const csvContent = generateCSV(items);

        return {
            success: true,
            csvContent,
            count: items.length
        };
    } catch (error) {
        console.error('Export filtered error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Export specific items by IDs
 * @param {Array<number>} itemIds - Array of item IDs to export
 * @returns {Object} - { success: boolean, csvContent: string, count: number }
 */
export const exportByIds = async (itemIds) => {
    try {
        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return {
                success: false,
                error: 'No item IDs provided'
            };
        }

        const items = await Item.findAll({
            where: {
                item_id: { [Op.in]: itemIds },
                status: { [Op.in]: ['active', 'draft'] }
            },
            order: [['name', 'ASC']]
        });

        const csvContent = generateCSV(items);

        return {
            success: true,
            csvContent,
            count: items.length
        };
    } catch (error) {
        console.error('Export by IDs error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Export all active items
 * @returns {Object} - { success: boolean, csvContent: string, count: number }
 */
export const exportAll = async () => {
    return exportFiltered({});
};
