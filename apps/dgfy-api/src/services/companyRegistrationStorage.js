import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getRegistrationUploadExtension,
  sanitizeOriginalFilename
} from '../modules/tenants/contracts/companyRegistrationDraftContract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRoot = path.resolve(__dirname, '..', '..', 'private-uploads', 'company-registration');

export const COMPANY_REGISTRATION_PRIVATE_STORAGE_ROOT = path.resolve(
  process.env.COMPANY_REGISTRATION_PRIVATE_STORAGE_DIR || defaultRoot
);

const resolveStoragePath = (storageKey) => {
  const normalizedKey = String(storageKey || '').replace(/\\/g, '/');
  if (!normalizedKey || path.isAbsolute(normalizedKey) || normalizedKey.includes('\0')) {
    throw new Error('Invalid company registration storage key.');
  }
  const root = path.resolve(COMPANY_REGISTRATION_PRIVATE_STORAGE_ROOT);
  const resolved = path.resolve(root, normalizedKey);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Company registration storage key escaped the private storage root.');
  }
  return resolved;
};

export const buildCompanyRegistrationStorageKey = ({ draftId, uploadId, mimeType }) => {
  const safeDraftId = String(draftId || '').trim();
  const safeUploadId = String(uploadId || '').trim();
  if (!/^[0-9a-f-]{16,}$/i.test(safeDraftId) || !/^[0-9a-f-]{16,}$/i.test(safeUploadId)) {
    throw new Error('Invalid company registration storage identifiers.');
  }
  return safeDraftId + '/' + safeUploadId + '.' + getRegistrationUploadExtension(mimeType);
};

export const persistCompanyRegistrationFile = async ({
  draftId,
  uploadId,
  originalName,
  mimeType,
  buffer
}) => {
  const storageKey = buildCompanyRegistrationStorageKey({ draftId, uploadId, mimeType });
  const filePath = resolveStoragePath(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });

  return {
    storageKey,
    sanitizedName: sanitizeOriginalFilename(originalName),
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    fileSize: buffer.length
  };
};

export const removeCompanyRegistrationFile = async (storageKey) => {
  await fs.rm(resolveStoragePath(storageKey), { force: true });
};

export const companyRegistrationStoragePathForKey = (storageKey) => resolveStoragePath(storageKey);
