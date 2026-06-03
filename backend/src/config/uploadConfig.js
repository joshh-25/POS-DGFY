import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { SAFE_IMAGE_MIME_TYPES } from '../modules/shared/utils/imageUploadValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

export const TEMP_DIR = uploadDir;
const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const BULK_CATALOG_IMAGE_TRANSPORT_MAX_BYTES = 6 * 1024 * 1024;

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
    fileFilter: (req, file, cb) => {
        cb(null, true);
    }
});

export const storefrontAssetUpload = buildStrictImageUpload({ maxBytes: IMAGE_UPLOAD_MAX_BYTES, maxFiles: 1 });
export const posCatalogImageUpload = buildStrictImageUpload({ maxBytes: IMAGE_UPLOAD_MAX_BYTES, maxFiles: 1 });
export const posCatalogBulkImageUpload = buildBulkCatalogImageUpload({ maxBytes: BULK_CATALOG_IMAGE_TRANSPORT_MAX_BYTES, maxFiles: 50 });
export const storefrontCatalogImageUpload = buildStrictImageUpload({ maxBytes: IMAGE_UPLOAD_MAX_BYTES, maxFiles: 1 });
export const storefrontCatalogGalleryImageUpload = buildStrictImageUpload({ maxBytes: IMAGE_UPLOAD_MAX_BYTES, maxFiles: 10 });
export const storefrontCatalogBulkImageUpload = buildBulkCatalogImageUpload({ maxBytes: BULK_CATALOG_IMAGE_TRANSPORT_MAX_BYTES, maxFiles: 50 });
