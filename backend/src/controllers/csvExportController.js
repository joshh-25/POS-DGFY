import * as csvExportService from '../services/csvExportService.js';

/**
 * Export items as CSV
 * GET /api/v1/items/export - Export with filters (query params)
 * POST /api/v1/items/export - Export specific items (itemIds in body)
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
        const filename = `items_export_${timestamp}.csv`;

        // Set headers for CSV download
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
                count: result.count
            },
            message: `${result.count} items would be exported`
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
