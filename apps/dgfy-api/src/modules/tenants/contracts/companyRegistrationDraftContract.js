import path from 'node:path';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const REGISTRATION_DRAFT_STATUSES = Object.freeze({
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ABANDONED: 'abandoned'
});

export const REGISTRATION_UPLOAD_CATEGORIES = Object.freeze({
  PROFILE_IMAGE: 'profile_image',
  COVER_IMAGE: 'cover_image',
  GALLERY_IMAGE: 'gallery_image',
  MENU_UPLOAD: 'menu_upload'
});

export const REGISTRATION_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const REGISTRATION_MAX_UPLOADS = 20;
export const REGISTRATION_MAX_GALLERY_UPLOADS = 10;
export const REGISTRATION_MAX_MENU_UPLOADS = 5;
export const REGISTRATION_MAX_DRAFT_BYTES = 250 * 1024;

export const REGISTRATION_UPLOAD_MIME_TYPES = Object.freeze({
  profile_image: Object.freeze(['image/jpeg', 'image/png']),
  cover_image: Object.freeze(['image/jpeg', 'image/png']),
  gallery_image: Object.freeze(['image/jpeg', 'image/png']),
  menu_upload: Object.freeze(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/pdf', 'image/jpeg', 'image/png'])
});

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const DRAFT_SECTIONS = new Set(['business', 'storefront', 'location', 'hours', 'menu']);

const validationError = (message, details = {}) => new DomainError(
  DomainErrorCode.VALIDATION_FAILED,
  message,
  { statusCode: 422, details: { error_code: 'REGISTRATION_DRAFT_INVALID', ...details } }
);

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const assertSafeJsonValue = (value, pathName = 'payload') => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeJsonValue(entry, pathName + '[' + index + ']'));
    return;
  }
  if (!isPlainObject(value)) {
    throw validationError('Registration draft data must contain JSON values only.', { field: pathName });
  }
  Object.entries(value).forEach(([key, entry]) => {
    if (DANGEROUS_KEYS.has(key)) {
      throw validationError('Registration draft data contains an unsupported field name.', { field: pathName + '.' + key });
    }
    assertSafeJsonValue(entry, pathName + '.' + key);
  });
};

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

export const normalizeDraftPayload = (payload = {}) => {
  if (!isPlainObject(payload)) {
    throw validationError('Registration draft payload must be an object.', { field: 'payload' });
  }

  assertSafeJsonValue(payload);
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, 'utf8') > REGISTRATION_MAX_DRAFT_BYTES) {
    throw validationError('Registration draft data is too large.', {
      field: 'payload',
      max_bytes: REGISTRATION_MAX_DRAFT_BYTES
    });
  }

  const normalized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!DRAFT_SECTIONS.has(key)) continue;
    normalized[key] = cloneJson(value);
  }
  return normalized;
};

export const extractDraftPayload = (body = {}) => {
  if (isPlainObject(body.payload)) return body.payload;
  if (isPlainObject(body.data)) return body.data;

  const sectionPayload = {};
  for (const section of DRAFT_SECTIONS) {
    if (Object.prototype.hasOwnProperty.call(body, section)) sectionPayload[section] = body[section];
  }
  return sectionPayload;
};

export const normalizeRegistrationStep = (value, fallback = 1) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3) {
    throw validationError('Registration step must be 1, 2, or 3.', { field: 'current_step' });
  }
  return parsed;
};

export const normalizeUploadCategory = (value) => {
  const category = String(value || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(REGISTRATION_UPLOAD_MIME_TYPES, category)) {
    throw validationError('Unsupported registration upload category.', {
      field: 'category',
      allowed: Object.keys(REGISTRATION_UPLOAD_MIME_TYPES)
    });
  }
  return category;
};

export const getAllowedUploadMimeTypes = (category) => (
  REGISTRATION_UPLOAD_MIME_TYPES[normalizeUploadCategory(category)]
);

export const getRegistrationUploadExtension = (mimeType) => ({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'text/plain': 'csv',
  'application/vnd.ms-excel': 'csv'
}[String(mimeType || '').trim().toLowerCase()] || 'bin');

export const sanitizeOriginalFilename = (originalName) => {
  const baseName = path.basename(String(originalName || 'file')).normalize('NFKC');
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 240);
  return sanitized || 'file';
};

const firstMeaningful = (...values) => values.find((value) => (
  typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined
));

const hasMeaningfulHours = (hours) => {
  if (Array.isArray(hours)) return hours.length > 0;
  return isPlainObject(hours) && Object.keys(hours).length > 0;
};

const resolveBusinessSection = (payload) => payload.business || payload.business_information || {};
const resolveStorefrontSection = (payload) => payload.storefront || payload.storefront_content || {};
const resolveLocationSection = (payload) => payload.location || payload.store_location || {};
const resolveHoursSection = (payload) => payload.hours || payload.business_hours || {};

export const validateRegistrationSubmission = ({ payload, uploads = [] }) => {
  const business = resolveBusinessSection(payload);
  const storefront = resolveStorefrontSection(payload);
  const location = resolveLocationSection(payload);
  const hours = resolveHoursSection(payload);
  const errors = [];

  if (!firstMeaningful(business.company_name, business.companyName, business.name)) {
    errors.push({ field: 'business.company_name', message: 'Company name is required.' });
  }
  if (!firstMeaningful(business.industry_key, business.industryKey, business.industry)) {
    errors.push({ field: 'business.industry_key', message: 'Industry is required.' });
  }

  const address = firstMeaningful(
    location.address,
    location.formatted_address,
    location.street_address,
    location.address_line
  );
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  if (!address && !hasCoordinates) {
    errors.push({ field: 'location', message: 'A business location or pinned coordinates are required.' });
  }
  if (!hasMeaningfulHours(hours)) {
    errors.push({ field: 'hours', message: 'Business hours are required.' });
  }

  const deliveryPartners = storefront.delivery_partners || storefront.deliveryPartners;
  if (Array.isArray(deliveryPartners) && deliveryPartners.length > 3) {
    errors.push({ field: 'storefront.delivery_partners', message: 'A maximum of three delivery partners is allowed.' });
  }

  const activeUploads = uploads.filter((upload) => upload.upload_status !== 'removed' && !upload.removed_at);
  const categoryCounts = activeUploads.reduce((counts, upload) => {
    counts[upload.category] = (counts[upload.category] || 0) + 1;
    return counts;
  }, {});

  if ((categoryCounts.profile_image || 0) > 1) {
    errors.push({ field: 'uploads.profile_image', message: 'Only one profile image is allowed.' });
  }
  if ((categoryCounts.cover_image || 0) > 1) {
    errors.push({ field: 'uploads.cover_image', message: 'Only one cover image is allowed.' });
  }
  if ((categoryCounts.gallery_image || 0) > REGISTRATION_MAX_GALLERY_UPLOADS) {
    errors.push({ field: 'uploads.gallery_image', message: 'Too many gallery images.' });
  }
  if ((categoryCounts.menu_upload || 0) > REGISTRATION_MAX_MENU_UPLOADS) {
    errors.push({ field: 'uploads.menu_upload', message: 'Too many menu uploads.' });
  }
  if (activeUploads.some((upload) => upload.validation_status !== 'passed' || upload.upload_status === 'failed')) {
    errors.push({ field: 'uploads', message: 'Every uploaded file must pass validation before submission.' });
  }

  if (errors.length > 0) {
    throw validationError('Complete the required registration details before submitting.', { fields: errors });
  }

  return {
    business,
    storefront,
    location,
    hours,
    activeUploads
  };
};

export const validateRegistrationFileSignature = ({ buffer, mimeType, category }) => {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
  const allowedMimeTypes = getAllowedUploadMimeTypes(category);
  if (!allowedMimeTypes.includes(normalizedMimeType)) {
    throw validationError('The selected file type is not supported for this upload category.', {
      field: 'file',
      category,
      mime_type: normalizedMimeType
    });
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw validationError('The uploaded file is empty.', { field: 'file' });
  }

  const startsWith = (bytes) => bytes.every((byte, index) => buffer[index] === byte);
  const signatureValid = normalizedMimeType === 'image/jpeg'
    ? startsWith([0xff, 0xd8, 0xff])
    : normalizedMimeType === 'image/png'
      ? startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : normalizedMimeType === 'application/pdf'
        ? buffer.subarray(0, 5).toString('ascii') === '%PDF-'
        : !buffer.subarray(0, 4096).includes(0);

  if (!signatureValid) {
    throw validationError('The uploaded file content does not match its declared type.', {
      field: 'file',
      mime_type: normalizedMimeType
    });
  }
  return true;
};
