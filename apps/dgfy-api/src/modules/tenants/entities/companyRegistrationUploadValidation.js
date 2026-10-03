import path from 'path';
import crypto from 'crypto';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const COMPANY_REGISTRATION_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const COMPANY_REGISTRATION_UPLOAD_KINDS = Object.freeze(['menu', 'profile', 'cover', 'gallery']);
const imageMimes = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const menuMimes = new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/pdf', ...imageMimes]);
const extensionByMime = Object.freeze({ 'text/csv': 'csv', 'text/plain': 'csv', 'application/vnd.ms-excel': 'csv', 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png' });

const invalid = (message, details = {}) => new DomainError(DomainErrorCode.VALIDATION_FAILED, message, { statusCode: 422, details: { error_code: 'COMPANY_REGISTRATION_UPLOAD_INVALID', ...details } });

const hasPrefix = (buffer, bytes) => bytes.every((byte, index) => buffer[index] === byte);

export const normalizeUploadKind = (kind) => {
    const normalized = String(kind || '').trim().toLowerCase();
    if (!COMPANY_REGISTRATION_UPLOAD_KINDS.includes(normalized)) throw invalid('Unsupported registration upload kind.', { field: 'kind' });
    return normalized;
};

export const validateCompanyRegistrationUpload = ({ file, kind }) => {
    const normalizedKind = normalizeUploadKind(kind);
    if (!file?.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) throw invalid('Upload content is required.', { field: 'file' });
    if (file.buffer.length > COMPANY_REGISTRATION_UPLOAD_MAX_BYTES) throw invalid('Registration uploads must be 10 MB or smaller.', { field: 'file' });
    const mime = String(file.mimetype || '').trim().toLowerCase();
    const accepted = normalizedKind === 'menu' ? menuMimes : imageMimes;
    if (!accepted.has(mime)) throw invalid('The uploaded file type is not supported for this registration field.', { field: 'file', mime_type: mime });

    const isPdf = hasPrefix(file.buffer, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    const isJpeg = hasPrefix(file.buffer, [0xff, 0xd8, 0xff]);
    const isPng = hasPrefix(file.buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const isCsv = !file.buffer.subarray(0, Math.min(file.buffer.length, 8192)).includes(0);
    const signatureMatches = mime === 'application/pdf' ? isPdf
        : mime === 'image/jpeg' || mime === 'image/jpg' ? isJpeg
            : mime === 'image/png' ? isPng
                : isCsv;
    if (!signatureMatches) throw invalid('The file signature does not match its declared type.', { field: 'file' });

    const basename = path.basename(String(file.originalname || 'upload'));
    const originalFilename = [...basename]
        .map((character) => {
            const code = character.charCodeAt(0);
            return code < 32 || character === '\\' || character === '/' ? '_' : character;
        })
        .join('')
        .slice(0, 255) || 'upload';
    const extension = extensionByMime[mime] || path.extname(originalFilename).replace('.', '').toLowerCase().slice(0, 10) || 'bin';
    return {
        kind: normalizedKind,
        mime_type: mime,
        original_filename: originalFilename,
        extension,
        byte_size: file.buffer.length,
        sha256: crypto.createHash('sha256').update(file.buffer).digest('hex')
    };
};
