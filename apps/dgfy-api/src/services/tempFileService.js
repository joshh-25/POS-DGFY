/**
 * Temporary File Service for AI Exports
 *
 * Manages temporary file storage for CSV exports and imports.
 * Files expire after 1 hour and are automatically cleaned up.
 */

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../config/logger.js';
import cacheService from './cacheService.js';
import {
  getConfiguredTempFileStorageMode,
  resolveTempFileStorageMode
} from '../config/hostingProfile.js';

// File expiry time in seconds (1 hour)
const FILE_EXPIRY_SECONDS = 60 * 60;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_EXPORT_DIR = path.resolve(__dirname, '../../storage/temp-ai-exports');
const LOCAL_FILE_PREFIX = 'ai-export-';
const LOCAL_FILE_SUFFIX = '.json';

const isSafeFileId = (fileId) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(fileId || ''));

const getRedisKey = (fileId) => `temp_file:${fileId}`;

const getLocalFilePath = (fileId) => {
  if (!isSafeFileId(fileId)) {
    throw new Error('Invalid temporary file id');
  }
  return path.join(TEMP_EXPORT_DIR, `${LOCAL_FILE_PREFIX}${fileId}${LOCAL_FILE_SUFFIX}`);
};

const serializeFileInfo = (fileInfo) => JSON.stringify({
  ...fileInfo,
  createdAt: fileInfo.createdAt instanceof Date ? fileInfo.createdAt.toISOString() : fileInfo.createdAt,
  expiresAt: fileInfo.expiresAt instanceof Date ? fileInfo.expiresAt.toISOString() : fileInfo.expiresAt
});

const normalizeFileInfo = (fileInfo) => ({
  ...fileInfo,
  createdAt: new Date(fileInfo.createdAt),
  expiresAt: new Date(fileInfo.expiresAt)
});

const isExpired = (fileInfo) => {
  const expiresAt = new Date(fileInfo?.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
};

const canAccessFile = (fileInfo, userId) => {
  if (userId === undefined || userId === null || String(userId).trim() === '') {
    return true;
  }

  if (fileInfo?.userId === undefined || fileInfo?.userId === null || String(fileInfo.userId).trim() === '') {
    return false;
  }

  return String(fileInfo.userId) === String(userId);
};

const readLocalFileInfo = async (fileId) => {
  try {
    const filePath = getLocalFilePath(fileId);
    const raw = await fs.readFile(filePath, 'utf8');
    const fileInfo = normalizeFileInfo(JSON.parse(raw));

    if (isExpired(fileInfo)) {
      await fs.unlink(filePath).catch(() => {});
      return null;
    }

    return fileInfo;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    logger.warn(`Failed to read local temp export ${fileId}: ${error.message}`);
    return null;
  }
};

const writeLocalFileInfo = async (fileInfo) => {
  await fs.mkdir(TEMP_EXPORT_DIR, { recursive: true });
  const filePath = getLocalFilePath(fileInfo.id);
  await fs.writeFile(filePath, serializeFileInfo(fileInfo), 'utf8');
};

export const getTempFileStorageMode = () => resolveTempFileStorageMode({
  cacheAvailable: cacheService.isAvailable()
});

/**
 * Store CSV content temporarily
 * @param {string} content - CSV content
 * @param {string} filename - Suggested filename
 * @param {number} userId - User who created the export
 * @returns {Object} File info with ID and URL
 */
export const storeTemporaryFile = async (content, filename, userId) => {
  const fileId = uuidv4();
  const expiresAt = new Date(Date.now() + FILE_EXPIRY_SECONDS * 1000);

  const fileInfo = {
    id: fileId,
    filename,
    content,
    userId,
    createdAt: new Date(),
    expiresAt,
    accessCount: 0
  };

  const storageMode = getTempFileStorageMode();
  const redisKey = getRedisKey(fileId);
  let storedInCache = false;

  if (storageMode === 'cache') {
    storedInCache = await cacheService.set(redisKey, serializeFileInfo(fileInfo), FILE_EXPIRY_SECONDS);
  }

  if (!storedInCache) {
    if (storageMode === 'cache') {
      const configuredMode = getConfiguredTempFileStorageMode();
      logger.warn(`Temp file cache storage unavailable; falling back to local storage (configured=${configuredMode})`);
    }
    await writeLocalFileInfo(fileInfo);
  }

  logger.info(`Created temp file: ${fileId} for user ${userId}`, {
    storageMode: storedInCache ? 'cache' : 'local'
  });

  return {
    fileId,
    filename,
    downloadUrl: `/api/v1/ai/exports/${fileId}`,
    expiresAt: expiresAt.toISOString(),
    expiresIn: '1 hour'
  };
};

/**
 * Get temporary file content
 * @param {string} fileId - File ID
 * @returns {Object|null} File content and info
 */
export const getTemporaryFile = async (fileId, userId = null) => {
  const storageMode = getTempFileStorageMode();
  const redisKey = getRedisKey(fileId);
  let fileInfo = null;

  if (storageMode === 'cache') {
    const fileData = await cacheService.get(redisKey);
    if (fileData) {
      fileInfo = normalizeFileInfo(JSON.parse(fileData));
    }
  }

  if (!fileInfo) {
    fileInfo = await readLocalFileInfo(fileId);
  }

  if (!fileInfo || isExpired(fileInfo)) {
    return null;
  }

  if (!canAccessFile(fileInfo, userId)) {
    logger.warn(`Denied temp export access for user ${userId}: ${fileId}`);
    return null;
  }

  return {
    content: fileInfo.content,
    filename: fileInfo.filename,
    contentType: 'text/csv',
    createdAt: new Date(fileInfo.createdAt),
    expiresAt: new Date(fileInfo.expiresAt)
  };
};

/**
 * Delete a temporary file
 * @param {string} fileId - File ID
 */
export const deleteTemporaryFile = async (fileId) => {
  const redisKey = getRedisKey(fileId);
  await cacheService.del(redisKey);
  try {
    await fs.unlink(getLocalFilePath(fileId));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`Failed to delete local temp export ${fileId}: ${error.message}`);
    }
  }
  logger.info(`Cleaned up temp file manually: ${fileId}`);
};

/**
 * Cleanup all expired files
 */
export const cleanupExpiredFiles = async () => {
  let deletedCount = 0;

  try {
    const files = await fs.readdir(TEMP_EXPORT_DIR);
    for (const file of files) {
      if (!file.startsWith(LOCAL_FILE_PREFIX) || !file.endsWith(LOCAL_FILE_SUFFIX)) {
        continue;
      }

      const filePath = path.join(TEMP_EXPORT_DIR, file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const fileInfo = JSON.parse(raw);
        if (isExpired(fileInfo)) {
          await fs.unlink(filePath);
          deletedCount += 1;
        }
      } catch (error) {
        const stats = await fs.stat(filePath).catch(() => null);
        if (stats && Date.now() - stats.mtimeMs > FILE_EXPIRY_SECONDS * 1000) {
          await fs.unlink(filePath).catch(() => {});
          deletedCount += 1;
        } else {
          logger.warn(`Failed to inspect local temp export ${file}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`Temp export cleanup failed: ${error.message}`);
    }
  }

  return deletedCount;
};

/**
 * Parse CSV content into rows
 * @param {string} csvContent - CSV string content
 * @returns {Object} Parsed data with headers and rows
 */
export const parseCsv = (csvContent) => {
  // Normalize escaped newlines: AI models and JSON round-trips may produce
  // literal backslash-n (\\n) instead of actual newline characters.
  // Also handle Windows-style \r\n
  let normalized = csvContent;
  // Replace literal two-char sequences \\r\\n or \\n with real newlines
  // (but only if there are no real newlines in the content already)
  if (!normalized.includes('\n')) {
    normalized = normalized.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  }
  // Also clean up \r from Windows line endings
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = normalized.trim().split('\n');

  if (lines.length === 0) {
    return { headers: [], rows: [], error: 'Empty CSV content' };
  }

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const values = parseCSVLine(line);
      const row = {};

      headers.forEach((header, idx) => {
        row[header.trim()] = values[idx]?.trim() || '';
      });

      rows.push(row);
    } catch (error) {
      errors.push({ line: i + 1, error: error.message });
    }
  }

  return {
    headers,
    rows,
    totalRows: rows.length,
    errors: errors.length > 0 ? errors : null
  };
};

/**
 * Parse a single CSV line handling quotes
 * @param {string} line - CSV line
 * @returns {Array} Array of values
 */
const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
};

/**
 * Generate CSV content from data
 * @param {Array} data - Array of objects
 * @param {Array} columns - Column definitions [{key, label}]
 * @returns {string} CSV content
 */
export const generateCsv = (data, columns) => {
  if (!data || data.length === 0) {
    return columns ? columns.map(c => c.label || c.key).join(',') : '';
  }

  // If no columns specified, use object keys from first row
  if (!columns) {
    columns = Object.keys(data[0]).map(key => ({ key, label: key }));
  }

  // Header row
  const header = columns.map(c => escapeCSVValue(c.label || c.key)).join(',');

  // Data rows
  const rows = data.map(item => {
    return columns.map(col => {
      const value = item[col.key];
      return escapeCSVValue(value);
    }).join(',');
  });

  return [header, ...rows].join('\n');
};

/**
 * Escape a value for CSV
 * @param {any} value - Value to escape
 * @returns {string} Escaped value
 */
const escapeCSVValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If contains comma, newline, or quote, wrap in quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

/**
 * Validate CSV structure for import
 * @param {Object} parsed - Parsed CSV data
 * @param {Array} requiredFields - Required field names
 * @returns {Object} Validation result
 */
export const validateCsvStructure = (parsed, requiredFields) => {
  const { headers, rows, errors } = parsed;

  const validationErrors = [];

  // Check for required fields
  const missingFields = requiredFields.filter(f => !headers.includes(f));
  if (missingFields.length > 0) {
    validationErrors.push({
      type: 'missing_fields',
      message: `Missing required columns: ${missingFields.join(', ')}`,
      fields: missingFields
    });
  }

  // Check for empty rows
  const emptyRows = rows.filter((row) => {
    const values = Object.values(row);
    return values.every(v => !v || v.trim() === '');
  });

  if (emptyRows.length > 0) {
    validationErrors.push({
      type: 'empty_rows',
      message: `Found ${emptyRows.length} empty row(s)`,
      count: emptyRows.length
    });
  }

  return {
    valid: validationErrors.length === 0,
    errors: validationErrors,
    parseErrors: errors,
    summary: {
      totalRows: rows.length,
      validRows: rows.length - emptyRows.length,
      invalidRows: emptyRows.length
    }
  };
};

export default {
  storeTemporaryFile,
  getTemporaryFile,
  getTempFileStorageMode,
  deleteTemporaryFile,
  cleanupExpiredFiles,
  parseCsv,
  generateCsv,
  validateCsvStructure
};
