import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { SAFE_IMAGE_MIME_TYPES } from '../modules/shared/utils/imageUploadValidation.js';
import { MENU_IMPORT_MAX_FILES_PER_BATCH } from './menuImportFeature.js';
import dbStore from '../utils/dbStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

export const TEMP_DIR = uploadDir;
export const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
// Catalog single-image uploads are optimized server-side before public storage.
// Keep the raw intake bounded so one request cannot exhaust local disk or memory.
export const CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES = 100 * 1024 * 1024;
export const BULK_CATALOG_IMAGE_TRANSPORT_MAX_BYTES = 10 * 1024 * 1024;
export const BULK_CATALOG_IMAGE_TRANSPORT_MAX_FILES = 50;

// Multipart parsers may finish their stream callbacks on a different async
// resource. Re-enter the request's tenant store before continuing so the
// handler cannot fall back to the default database after a valid tenant-auth
// request has already passed authentication.
export const preserveTenantContext = (multipartMiddleware) => (req, res, next) => {
    const tenantContext = dbStore.getStore();
    if (!tenantContext) {
        return multipartMiddleware(req, res, next);
    }

    return dbStore.run(tenantContext, () => multipartMiddleware(req, res, (error) => (
        dbStore.run(tenantContext, () => next(error))
    )));
};

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Create unique filename: timestamp-random-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    // Allow images, PDFs, text files, CSVs, Excel
    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    // Fix 8.3: Enforce the allowlist — reject unknown MIME types
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname), false);
    }
};

// Limits
const limits = {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // Max 5 files
};

export const upload = multer({
    storage: storage,
    limits: limits,
    fileFilter: fileFilter
});

const buildStrictImageUpload = ({ maxBytes = IMAGE_UPLOAD_MAX_BYTES, maxFiles = 1 } = {}) => multer({
    storage,
    limits: {
        fileSize: maxBytes,
        files: maxFiles
    },
    fileFilter: (req, file, cb) => {
        const mime = String(file?.mimetype || '').trim().toLowerCase();
        if (SAFE_IMAGE_MIME_TYPES.includes(mime)) {
            cb(null, true);
            return;
        }
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file?.fieldname || 'image'), false);
    }
});

const buildBulkCatalogImageUpload = ({ maxBytes = BULK_CATALOG_IMAGE_TRANSPORT_MAX_BYTES, maxFiles = 50 } = {}) => multer({
    storage,
    limits: {
        fileSize: maxBytes,
        files: maxFiles
    },
    // Bulk catalog image uploads intentionally accept the multipart batch at
    // transport so the catalog use cases can return per-file results and clean
    // rejected temp files. Do not make this strict without updating ADR 0017.
    fileFilter: (req, file, cb) => {
        cb(null, true);
    }
});

// Menu import (PDF/PNG/JPG) — a dedicated filter rather than reusing the generic
// `upload` above, which allows gif/webp/csv/excel/text mimetypes this feature
// doesn't handle; those would otherwise slip past multer and fail downstream with
// a confusing extraction error instead of a clear "unsupported file type" one.
export const menuImportFileUpload = multer({
    storage,
    limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        const mime = String(file?.mimetype || '').trim().toLowerCase();
        if (['application/pdf', 'image/jpeg', 'image/png'].includes(mime)) {
            cb(null, true);
            return;
        }
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file?.fieldname || 'file'), false);
    }
});

const MENU_IMPORT_MIME_EXTENSIONS = Object.freeze({
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png'
});

// Batch menu import intentionally uses its own diskStorage rather than the
// shared `storage` above. The shared storage's filename callback interpolates
// `file.originalname` straight into the on-disk path, which is a directory-
// traversal primitive if a crafted name ever slips past multer's own
// sanitization — not a risk worth broadening on an endpoint that now accepts
// up to MENU_IMPORT_MAX_FILES_PER_BATCH files per request. The original name is
// kept in the job manifest for display only; it never reaches the filesystem.
const menuImportBatchStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const mime = String(file?.mimetype || '').trim().toLowerCase();
        const ext = MENU_IMPORT_MIME_EXTENSIONS[mime] || 'bin';
        cb(null, `menu-${crypto.randomUUID()}.${ext}`);
    }
});

// Batch menu import (multi-file: several PDFs/photos in one job) — same mime
// allowlist as menuImportFileUpload, but accepts up to
// MENU_IMPORT_MAX_FILES_PER_BATCH files per request instead of one.
export const menuImportBatchUpload = multer({
    storage: menuImportBatchStorage,
    limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES, files: MENU_IMPORT_MAX_FILES_PER_BATCH },
    fileFilter: (req, file, cb) => {
        const mime = String(file?.mimetype || '').trim().toLowerCase();
        if (['application/pdf', 'image/jpeg', 'image/png'].includes(mime)) {
            cb(null, true);
            return;
        }
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file?.fieldname || 'files'), false);
    }
});

export const storefrontAssetUpload = buildStrictImageUpload({ maxBytes: IMAGE_UPLOAD_MAX_BYTES, maxFiles: 1 });
export const posCatalogImageUpload = buildStrictImageUpload({ maxBytes: CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES, maxFiles: 1 });
export const posCatalogBulkImageUpload = buildBulkCatalogImageUpload({ maxBytes: BULK_CATALOG_IMAGE_TRANSPORT_MAX_BYTES, maxFiles: BULK_CATALOG_IMAGE_TRANSPORT_MAX_FILES });
export const storefrontCatalogImageUpload = buildStrictImageUpload({ maxBytes: CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES, maxFiles: 1 });
export const storefrontCatalogGalleryImageUpload = buildStrictImageUpload({ maxBytes: IMAGE_UPLOAD_MAX_BYTES, maxFiles: 10 });
export const storefrontCatalogBulkImageUpload = buildBulkCatalogImageUpload({ maxBytes: BULK_CATALOG_IMAGE_TRANSPORT_MAX_BYTES, maxFiles: BULK_CATALOG_IMAGE_TRANSPORT_MAX_FILES });
