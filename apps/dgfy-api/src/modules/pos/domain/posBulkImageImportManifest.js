import path from 'node:path';
import { parse } from 'csv-parse/sync';
import {
    POS_BULK_IMAGE_IMPORT_MAX_CSV_BYTES,
    POS_BULK_IMAGE_IMPORT_MAX_FILES,
    POS_BULK_IMAGE_IMPORT_ALLOWED_EXTENSIONS
} from '../../../config/posBulkImageImportFeature.js';

const HEADERS = ['sku_code', 'image_filename', 'replace_existing'];

export const parsePosBulkImageImportManifest = (csv) => {
    if (typeof csv !== 'string' || !csv.trim()) throw new Error('CSV manifest is required');
    if (Buffer.byteLength(csv, 'utf8') > POS_BULK_IMAGE_IMPORT_MAX_CSV_BYTES) {
        throw new Error('CSV manifest exceeds 1 MiB');
    }
    const records = parse(csv, {
        bom: true,
        skip_empty_lines: true,
        max_record_size: 4096,
        trim: true
    });
    const headers = records.shift();
    if (headers?.length !== HEADERS.length || headers.some((value, index) => value !== HEADERS[index])) {
        throw new Error(`CSV headers must be ${HEADERS.join(',')}`);
    }
    if (!records.length || records.length > POS_BULK_IMAGE_IMPORT_MAX_FILES) {
        throw new Error('CSV must contain between 1 and 500 image mappings');
    }
    const skus = new Set();
    const filenames = new Set();
    return records.map(([sku, filename, replace], index) => {
        const row = index + 2;
        // eslint-disable-next-line no-control-regex -- intentional: reject control characters in SKU input
        if (!sku || sku.length > 180 || /[\u0000-\u001f\u007f]/u.test(sku)) {
            throw new Error(`Invalid SKU on CSV row ${row}`);
        }
        // eslint-disable-next-line no-control-regex -- intentional: reject control characters in filename input
        if (!filename || filename.length > 180 || /[\\/:\u0000-\u001f\u007f]/u.test(filename)
            || filename.endsWith('.') || filename !== filename.trim()
            || !POS_BULK_IMAGE_IMPORT_ALLOWED_EXTENSIONS.includes(path.extname(filename).toLowerCase())) {
            throw new Error(`Invalid image filename on CSV row ${row}`);
        }
        if (!['true', 'false'].includes(replace)) throw new Error(`Replacement must be true or false on CSV row ${row}`);
        const skuKey = sku.toUpperCase();
        const filenameKey = filename.toLowerCase();
        if (skus.has(skuKey)) throw new Error(`Duplicate SKU on CSV row ${row}`);
        if (filenames.has(filenameKey)) throw new Error(`Duplicate image filename on CSV row ${row}`);
        skus.add(skuKey);
        filenames.add(filenameKey);
        return { sku_code: sku, image_filename: filename, replace_existing: replace === 'true' };
    });
};
