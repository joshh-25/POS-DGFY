import * as csvImportService from '../services/csvImportService.js';

/**
 * Preview CSV import - validate without committing
 * POST /api/v1/items/import/preview
 */
export const previewImport = async (req, res) => {
    try {
        // Check if file was uploaded
        if (!req.body.csvContent && !req.file) {
            return res.status(400).json({
                success: false,
                message: 'No CSV content provided. Send csvContent in body or upload a file.'
            });
        }

        // Get CSV content from body or file
        let csvContent;
        if (req.file) {
            csvContent = req.file.buffer.toString('utf-8');
        } else {
            csvContent = req.body.csvContent;
        }

        const result = await csvImportService.previewImport(csvContent);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error
            });
        }

        return res.status(200).json({
            success: true,
            data: result,
            message: `Preview complete: ${result.validRows} valid rows, ${result.invalidRows} with errors`
        });
    } catch (error) {
        console.error('CSV preview error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to preview CSV import',
            error: error.message
        });
    }
};

/**
 * Confirm and execute the import
 * POST /api/v1/items/import/confirm
 */
export const confirmImport = async (req, res) => {
    try {
        const { rows } = req.body;

        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No rows provided for import. Send rows array from preview.'
            });
        }

        const userId = req.user?.user_id;
        const result = await csvImportService.confirmImport(rows, userId);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error
            });
        }

        return res.status(200).json({
            success: true,
            data: result,
            message: `Import complete: ${result.createdCount} created, ${result.updatedCount} updated, ${result.failedCount} failed`
        });
    } catch (error) {
        console.error('CSV import error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to execute CSV import',
            error: error.message
        });
    }
};

/**
 * Get CSV template
 * GET /api/v1/items/import/template
 */
export const getTemplate = async (req, res) => {
    try {
        const headers = csvImportService.getTemplateHeaders();

        // Create sample rows for each category
        const sampleRows = [
            // Raw material example
            ['RM-001', 'Flour - All Purpose', 'raw_material', '', 'High quality wheat flour', '', '1000', '100', '50', 'kg', '45.00', 'TRUE', '365', '30', '', '', '', '', '', '', '', '', '', '', 'wheat'],
            // Packaging example
            ['PKG-001', 'Cake Box - 8 inch', 'packaging', '', 'Standard cake box', '', '500', '50', '25', 'pcs', '15.00', 'FALSE', '', '', '', '', '', '', '8', '8', '4', 'Cardboard', 'White with logo', '1 cake'],
            // Product example (finished goods)
            ['FG-001', 'Chocolate Cake 8inch', 'product', 'finished_goods', 'Premium chocolate cake', 'Cakes', '50', '10', '5', 'pcs', '450.00', 'TRUE', '5', '2', '1', '95', '5', 'Store in cool place', '', '', '', '', '', '', 'milk,eggs,wheat'],
            // Supplies example
            ['SUP-001', 'Disposable Gloves - M', 'supplies', '', 'Medium size latex gloves', '', '1000', '200', '100', 'pcs', '2.50', 'FALSE', '', '', '', '', '', '', '', '', '', '', '', '', '']
        ];

        // Build CSV content
        let csvContent = headers.join(',') + '\n';
        for (const row of sampleRows) {
            csvContent += row.map(cell => {
                // Escape cells containing commas or quotes
                if (cell.includes(',') || cell.includes('"')) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(',') + '\n';
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=item_import_template.csv');
        return res.send(csvContent);
    } catch (error) {
        console.error('Template generation error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate template',
            error: error.message
        });
    }
};
