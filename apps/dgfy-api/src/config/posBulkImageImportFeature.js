export const POS_BULK_IMAGE_IMPORT_MAX_FILES = 500;
export const POS_BULK_IMAGE_IMPORT_MAX_ZIP_ENTRIES = 1000;
export const POS_BULK_IMAGE_IMPORT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const POS_BULK_IMAGE_IMPORT_MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
export const POS_BULK_IMAGE_IMPORT_MAX_EXPANDED_BYTES = 1024 * 1024 * 1024;
export const POS_BULK_IMAGE_IMPORT_MAX_CSV_BYTES = 1024 * 1024;
export const POS_BULK_IMAGE_IMPORT_CHUNK_BYTES = 6 * 1024 * 1024;
export const POS_BULK_IMAGE_IMPORT_MAX_EXPANSION_RATIO = 25;
export const POS_BULK_IMAGE_IMPORT_TTL_SECONDS = 24 * 60 * 60;
export const POS_BULK_IMAGE_IMPORT_LEASE_MS = 30 * 60 * 1000;
export const POS_BULK_IMAGE_IMPORT_MAX_ATTEMPTS = 3;
export const POS_BULK_IMAGE_IMPORT_WORKER_CONCURRENCY = 2;

export const POS_BULK_IMAGE_IMPORT_ALLOWED_EXTENSIONS = Object.freeze(['.jpg', '.jpeg', '.png', '.webp']);
export const POS_BULK_IMAGE_IMPORT_MIME_BY_EXTENSION = Object.freeze({
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
});

// Production handoff: enable this feature only after REDIS_URL points to a
// durable, shared Redis service with persistence and monitoring. Never replace
// the Redis-backed queue with process memory in production: API/worker restarts
// would lose 500-image import progress and could leave uploads half-applied.
export const isPosBulkImageImportEnabled = (env = process.env) => (
    String(env.POS_BULK_IMAGE_IMPORT_ENABLED || '').trim().toLowerCase() === 'true'
);
