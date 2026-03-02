import { parse } from 'csv-parse'; // Fix 6.3: async variant, not csv-parse/sync
import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { createSupplierSchema, updateSupplierSchema } from '../validators/supplierValidator.js';


// Valid Statuses
const VALID_STATUSES = ['active', 'inactive', 'draft'];

/**
 * Parse CSV content and transform rows to object format
 *
 * Fix 6.3: Previously used csv-parse/sync which blocks the Node.js Event Loop.
 * Switched to async Promise-based parse() — non-blocking, Event Loop stays responsive.
 */
export const parseCSV = (csvContent) => {
    return new Promise((resolve, reject) => {
        parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            cast: false, // Keep as strings
            bom: true   // Fix 6.5: Handle UTF-8 Byte Order Mark
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
 * Transform a CSV row to Supplier data format
 */
const transformRow = (row) => {
    const supplier = {};

    // Map CSV fields to DB fields
    if (row.name) supplier.name = row.name.trim();
    if (row.contact_person) supplier.contact_person = row.contact_person.trim();
    if (row.email) supplier.email = row.email.trim();
    if (row.phone) supplier.phone = row.phone.trim();
    if (row.address) supplier.address = row.address.trim();

    if (row.quality_rating) {
        const rating = parseFloat(row.quality_rating);
        supplier.quality_rating = isNaN(rating) ? null : rating;
    }

    if (row.avg_delivery_days) {
        const days = parseInt(row.avg_delivery_days);
        supplier.avg_delivery_days = isNaN(days) ? null : days;
    }

    if (row.notes) supplier.notes = row.notes.trim();

    if (row.status) {
        const status = row.status.trim().toLowerCase();
        if (VALID_STATUSES.includes(status)) {
            supplier.status = status;
        }
    }

    return supplier;
};

/**
 * Validate a single supplier and check for existing by Name (or Email)
 */
const validateSupplier = async (supplierData, rowIndex, existingSuppliersMap) => {
    const errors = [];
    let action = 'CREATE';
    let existingSupplierId = null;

    // Check availability by Name (Case insensitive check usually good for names, but map keys are exact)
    // Using simple exact match from map for now.
    // existingSuppliersMap key: name.toLowerCase()

    const normalizedName = supplierData.name ? supplierData.name.toLowerCase() : '';

    if (normalizedName && existingSuppliersMap.has(normalizedName)) {
        action = 'UPDATE';
        existingSupplierId = existingSuppliersMap.get(normalizedName);
    }

    // Choose validator
    const schema = action === 'CREATE' ? createSupplierSchema : updateSupplierSchema;

    // Validate
    const { error, value } = schema.validate(supplierData, { abortEarly: false, stripUnknown: true });

    if (error) {
        errors.push(...error.details.map(d => d.message));
    }

    return {
        rowIndex,
        action,
        existingSupplierId,
        data: value || supplierData,
        valid: errors.length === 0,
        errors
    };
};

/**
 * Preview CSV import
 */
export const previewImport = async (csvContent) => {
    const parseResult = parseCSV(csvContent);
    if (!parseResult.success) {
        return { success: false, error: parseResult.error };
    }

    const records = parseResult.records;
    if (records.length === 0) {
        return { success: false, error: 'CSV file is empty' };
    }

    // Load existing suppliers for duplicate check
    const Supplier = dbStore.get('Supplier');
    const existingSuppliers = await Supplier.findAll({
        attributes: ['supplier_id', 'name'],
        where: { deleted_at: null }
    });

    // Create map for O(1) lookup: name -> id
    const existingSuppliersMap = new Map(existingSuppliers.map(s => [s.name.toLowerCase(), s.supplier_id]));

    const previewRows = [];
    let validCount = 0;
    let createCount = 0;
    let updateCount = 0;

    for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const supplierData = transformRow(row);
        const validation = await validateSupplier(supplierData, i + 1, existingSuppliersMap);

        previewRows.push({
            rowNumber: i + 1,
            name: supplierData.name || '',
            email: supplierData.email || '',
            action: validation.action,
            valid: validation.valid,
            errors: validation.errors,
            data: validation.data,
            existingSupplierId: validation.existingSupplierId
        });

        if (validation.valid) {
            validCount++;
            if (validation.action === 'CREATE') createCount++;
            else updateCount++;
        }
    }

    return {
        success: true,
        totalRows: records.length,
        validRows: validCount,
        invalidRows: records.length - validCount,
        createCount,
        updateCount,
        rows: previewRows
    };
};

/**
 * Confirm Import
 */
export const confirmImport = async (rows, userId) => {
    const results = {
        created: [],
        updated: [],
        failed: []
    };

    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    const transaction = await sequelize.transaction();

    try {
        for (const row of rows) {
            if (!row.valid) {
                results.failed.push({
                    rowNumber: row.rowNumber,
                    name: row.name,
                    errors: row.errors
                });
                continue;
            }

            try {
                const Supplier = dbStore.get('Supplier');
                if (row.action === 'CREATE') {
                    const newSupplier = await Supplier.create({
                        ...row.data,
                        status: row.data.status || 'active'
                    }, { transaction });

                    results.created.push({
                        rowNumber: row.rowNumber,
                        supplier_id: newSupplier.supplier_id,
                        name: newSupplier.name
                    });
                } else {
                    // UPDATE
                    await Supplier.update(row.data, {
                        where: { supplier_id: row.existingSupplierId },
                        transaction
                    });
                    results.updated.push({
                        rowNumber: row.rowNumber,
                        supplier_id: row.existingSupplierId,
                        name: row.data.name
                    });
                }
            } catch (error) {
                // Should we fail the whole batch? Implementation Plan 6.4 implies "transaction" which usually means atomicity.
                // However, preserving partial success logic requires isolated transactions or savepoints.
                // Given "Wrap confirmImport logic in a Sequelize transaction", we'll enforce atomicity for the batch of valid rows.
                throw error;
            }
        }

        await transaction.commit();

    } catch (batchError) {
        await transaction.rollback();
        // Mark all valid rows as failed due to batch error
        const validRows = rows.filter(r => r.valid);
        for (const row of validRows) {
            results.failed.push({
                rowNumber: row.rowNumber,
                name: row.name,
                errors: [`Batch Transaction Failed: ${batchError.message}`]
            });
        }
        // Created and Updated arrays should be empty (or cleared) since we rolled back
        results.created = [];
        results.updated = [];
    }

    return {
        success: true,
        createdCount: results.created.length,
        updatedCount: results.updated.length,
        failedCount: results.failed.length,
        results
    };
};

/**
 * Get Template Headers
 */
export const getHeaders = () => {
    return [
        'name',
        'contact_person',
        'email',
        'phone',
        'address',
        'quality_rating',
        'avg_delivery_days',
        'notes',
        'status'
    ];
};

/**
 * Export Suppliers
 */
export const exportSuppliers = async (filters = {}) => {
    try {
        const where = { deleted_at: null };

        if (filters.search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${filters.search}%` } },
                { contact_person: { [Op.like]: `%${filters.search}%` } },
                { email: { [Op.like]: `%${filters.search}%` } }
            ];
        }

        if (filters.status && filters.status !== 'all') {
            where.status = filters.status;
        }

        if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
            where.supplier_id = { [Op.in]: filters.ids };
        }


        const Supplier = dbStore.get('Supplier');
        const suppliers = await Supplier.findAll({
            where,
            order: [['name', 'ASC']],
            raw: true
        });

        const headers = getHeaders();
        let csvContent = headers.join(',') + '\n';

        for (const s of suppliers) {
            const row = headers.map(header => {
                let val = s[header];
                if (val === null || val === undefined) return '';
                val = String(val);

                // Fix: CSV Formula Injection Prevention
                if (/^[=+\-@]/.test(val)) {
                    val = `'${val}`;
                }

                // Escape quotes and wrap in quotes if contains comma or quote
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            });
            csvContent += row.join(',') + '\n';
        }

        return {
            success: true,
            csvContent,
            count: suppliers.length
        };

    } catch (error) {
        return { success: false, error: error.message };
    }
};
