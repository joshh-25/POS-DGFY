import crypto from 'crypto';

export class EnvValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EnvValidationError';
    }
}

export class DestructiveOperationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DestructiveOperationError';
    }
}

export class TargetGuardError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TargetGuardError';
    }
}

export class MetadataSchemaError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MetadataSchemaError';
    }
}

/**
 * Ported from backend/scripts/sync-tenant-schemas.js normalizeErrorSignature —
 * same sha1-hash-and-truncate-to-16-chars fingerprint approach.
 */
export function normalizeErrorSignature(message) {
    const raw = String(message || '').trim();
    if (!raw) {
        return {
            error_code: 'unknown_error',
            normalized_message: 'unknown error',
            fingerprint: 'unknown'
        };
    }

    const lowered = raw.toLowerCase();
    let errorCode = 'unknown_error';
    if (lowered.includes('too many keys specified; max 64 keys allowed')) {
        errorCode = 'mysql_too_many_keys';
    } else if (lowered.includes('foreign key constraint is incorrectly formed') || lowered.includes('errno: 150')) {
        errorCode = 'mysql_foreign_key_incorrectly_formed';
    }

    const normalizedMessage = lowered
        .replace(/`[^`]+`/g, '`<redacted>`')
        .replace(/\b\d+\b/g, '#')
        .replace(/\s+/g, ' ')
        .trim();

    const fingerprint = crypto
        .createHash('sha1')
        .update(`${errorCode}|${normalizedMessage}`)
        .digest('hex')
        .slice(0, 16);

    return {
        error_code: errorCode,
        normalized_message: normalizedMessage,
        fingerprint
    };
}

/**
 * Ported from backend/scripts/sync-tenant-schemas.js createSyncFailureRecord,
 * replacing the tenant_id/tenant_name/tenant_db fields with command.
 */
export function createCommandFailureRecord(command, error) {
    const signature = normalizeErrorSignature(error?.message || error);
    return {
        command,
        status: 'failed',
        error_code: signature.error_code,
        error_message: String(error?.message || error || 'Unknown error'),
        normalized_message: signature.normalized_message,
        fingerprint: signature.fingerprint
    };
}
