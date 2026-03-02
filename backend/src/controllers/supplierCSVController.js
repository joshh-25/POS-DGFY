import fs from 'fs/promises';
import * as supplierCSVService from '../services/supplierCSVService.js';

/**
 * Export suppliers as CSV
 * GET /api/v1/suppliers/export
 */
export const exportSuppliers = async (req, res) => {
    try {
        console.log('Export Params:', req.query); // DEBUG: check what is received
        const filters = {
            search: req.query.search,
            status: req.query.status,
            ids: req.query.ids ? String(req.query.ids).split(',') : undefined
        };

        const result = await supplierCSVService.exportSuppliers(filters);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error
            });
        }

        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `suppliers_export_${timestamp}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        return res.send(result.csvContent);
    } catch (error) {
        console.error('Supplier export error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to export suppliers',
            error: error.message
        });
    }
};

/**
 * Get Supplier Import Template
 * GET /api/v1/suppliers/import/template
 */
export const getTemplate = async (req, res) => {
    try {
        const headers = supplierCSVService.getHeaders();
        const csvContent = headers.join(',') + '\n';

        const filename = 'suppliers_import_template.csv';
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

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

/**
 * Preview Import
 * POST /api/v1/suppliers/import/preview
 *
 * Fix 4.3/8.3: Upload config uses diskStorage (req.file.path, not req.file.buffer).
 * Read from disk path with fs.readFile (async), delete temp file in finally block.
 */
export const previewImport = async (req, res) => {
    let filePath = null;
    try {
        if (!req.body.csvContent && !req.file) {
            return res.status(400).json({
                success: false,
                message: 'No CSV content provided'
            });
        }

        let csvContent;
        if (req.file) {
            filePath = req.file.path; // disk path set by multer.diskStorage
            csvContent = await fs.readFile(filePath, 'utf-8'); // async, non-blocking
        } else {
            csvContent = req.body.csvContent;
        }

        const result = await supplierCSVService.previewImport(csvContent);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error
            });
        }

        return res.status(200).json({
            success: true,
            data: result,
            message: `Preview complete: ${result.validRows} valid rows`
        });
    } catch (error) {
        console.error('Preview error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to preview import',
            error: error.message
        });
    } finally {
        // Fix 8.3: Delete temp file immediately after reading, regardless of outcome
        if (filePath) {
            try { await fs.unlink(filePath); } catch { /* ignore */ }
        }
    }
};

/**
 * Confirm Import
 * POST /api/v1/suppliers/import/confirm
 */
export const confirmImport = async (req, res) => {
    try {
        const { rows } = req.body;
        if (!rows || !Array.isArray(rows)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid rows data'
            });
        }

        const userId = req.user?.user_id;
        const result = await supplierCSVService.confirmImport(rows, userId);

        return res.status(200).json({
            success: true,
            data: result,
            message: `Import complete: ${result.createdCount} created, ${result.updatedCount} updated`
        });
    } catch (error) {
        console.error('Import confirmation error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to confirm import',
            error: error.message
        });
    }
};
