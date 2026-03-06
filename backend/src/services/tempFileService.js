/**
 * Temporary File Service for AI Exports
 *
 * Manages temporary file storage for CSV exports and imports.
 * Files expire after 1 hour and are automatically cleaned up.
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';
import cacheService from './cacheService.js';

// File expiry time in seconds (1 hour)
const FILE_EXPIRY_SECONDS = 60 * 60;

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

  const redisKey = `temp_file:${fileId}`;
  await cacheService.set(redisKey, JSON.stringify(fileInfo), FILE_EXPIRY_SECONDS);

  logger.info(`Created temp file: ${fileId} for user ${userId}`);

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
 * @param {number} userId - User requesting the file
 * @returns {Object|null} File content and info
 */
export const getTemporaryFile = async (fileId, userId) => {
  const redisKey = `temp_file:${fileId}`;
  const fileData = await cacheService.get(redisKey);

  if (!fileData) {
    return null;
  }

  const fileInfo = JSON.parse(fileData);

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
  const redisKey = `temp_file:${fileId}`;
  await cacheService.del(redisKey);
  logger.info(`Cleaned up temp file manually: ${fileId}`);
};

/**
 * Cleanup all expired files
 * Note: Handled natively by Redis TTL, this function is a no-op implementation 
 * for backwards compatibility with any potential scheduled tasks.
 */
export const cleanupExpiredFiles = () => {
  // No-op - Redis handles TTL
  return 0;
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
  const emptyRows = rows.filter((row, idx) => {
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
  deleteTemporaryFile,
  cleanupExpiredFiles,
  parseCsv,
  generateCsv,
  validateCsvStructure
};
