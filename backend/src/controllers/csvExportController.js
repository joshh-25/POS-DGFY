import * as csvExportService from '../services/csvExportService.js';

/**
 * Export items as CSV or ZIP
 * GET /api/v1/items/export - Export with filters (query params)
 * POST /api/v1/items/export - Export specific items (itemIds in body)
 * 
 * Returns:
 * - Single CSV if all items are same type (items or products)
 * - ZIP file with items.csv and products.csv if mixed types
 */
export const exportItems = async (req, res) => {
    try {
        let result;

        // Check if this is a POST request with specific item IDs
        if (req.method === 'POST' && req.body.itemIds) {
            const { itemIds } = req.body;

            if (!Array.isArray(itemIds) || itemIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'itemIds must be a non-empty array'
                });
            }

            result = await csvExportService.exportByIds(itemIds);
        } else {
            // GET request with filter query params
            const filters = {
                category: req.query.category,
                search: req.query.search,
                fifo: req.query.fifo,
                folder: req.query.folder
            };

            result = await csvExportService.exportFiltered(filters);
        }

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error
            });
        }

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0];

        // Handle ZIP response (mixed items and products)
        if (result.isZip && result.zipBuffer) {
            const filename = `inventory_export_${timestamp}.zip`;
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', result.zipBuffer.length);
            return res.send(result.zipBuffer);
        }

        // Handle CSV response (single type)
        const typePrefix = result.templateType === 'products' ? 'products' : 'items';
        const filename = `${typePrefix}_export_${timestamp}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        return res.send(result.csvContent);
    } catch (error) {
        console.error('CSV export error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to export items',
            error: error.message
        });
    }
};

/**
 * Export all items as ZIP or CSV
 * GET /api/v1/items/export/all
 */
export const exportAllItems = async (req, res) => {
    try {
        const result = await csvExportService.exportAll();

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error
            });
        }

        const timestamp = new Date().toISOString().split('T')[0];

        // Handle ZIP response
        if (result.isZip && result.zipBuffer) {
            const filename = `inventory_export_${timestamp}.zip`;
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', result.zipBuffer.length);
            return res.send(result.zipBuffer);
        }

        // Handle CSV response
        const typePrefix = result.templateType === 'products' ? 'products' : 'items';
        const filename = `${typePrefix}_export_${timestamp}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        return res.send(result.csvContent);
    } catch (error) {
        console.error('Export all error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to export all items',
            error: error.message
        });
    }
};

/**
 * Get export count preview (without downloading)
 * GET /api/v1/items/export/preview
 */
export const previewExport = async (req, res) => {
    try {
        const filters = {
            category: req.query.category,
            search: req.query.search,
            fifo: req.query.fifo,
            folder: req.query.folder
        };

        const result = await csvExportService.exportFiltered(filters);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                count: result.count,
                isZip: result.isZip || false,
                itemsCount: result.itemsCount,
                productsCount: result.productsCount
            },
            message: result.isZip
                ? `${result.count} items would be exported as ZIP (${result.itemsCount} items + ${result.productsCount} products)`
                : `${result.count} items would be exported`
        });
    } catch (error) {
        console.error('Export preview error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to preview export',
            error: error.message
        });
    }
};
