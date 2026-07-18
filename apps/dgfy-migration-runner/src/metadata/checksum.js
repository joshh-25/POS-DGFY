import { readFile } from 'fs/promises';
import crypto from 'crypto';

/**
 * Deterministic 16-hex-char checksum of a migration file's contents.
 * Follows the same "hash and truncate to 16 chars" convention as
 * utils/errors.js's normalizeErrorSignature, using sha256 over file bytes
 * instead of sha1 over an error string.
 *
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function computeFileChecksum(filePath) {
    const contents = await readFile(filePath);
    return crypto.createHash('sha256').update(contents).digest('hex').slice(0, 16);
}
