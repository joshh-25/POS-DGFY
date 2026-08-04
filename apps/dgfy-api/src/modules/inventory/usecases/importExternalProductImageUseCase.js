import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { SAFE_IMAGE_MIME_TYPES } from '../../shared/utils/imageUploadValidation.js';
import { STOREFRONT_CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES } from './storefrontCatalogUseCases.js';

// Same volume as uploads/originals/... (see itemImageGenerationService.js's
// identical UPLOAD_TEMP_DIR for why this can't be os.tmpdir()) so the later
// rename() in storeOptimizedImageAsset is a same-device move.
const UPLOAD_TEMP_DIR = fileURLToPath(new URL('../../../../uploads/temp/', import.meta.url));

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_ALLOWED_IMAGE_HOSTS = Object.freeze(['images.openfoodfacts.org']);
const MIME_EXTENSION = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/avif': '.avif'
});

const fail = (message, reasonCode, statusCode = 422) => new DomainError(
  statusCode === 503 ? DomainErrorCode.SERVICE_UNAVAILABLE : DomainErrorCode.VALIDATION_FAILED,
  message,
  { statusCode, details: { reason_code: reasonCode } }
);

const normalizeMime = (value) => {
  const mime = String(value || '').split(';')[0].trim().toLowerCase();
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
};

const readLimitedBody = async (response, maxBytes) => {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw fail('The registry image is too large to import.', 'PRODUCT_IMAGE_TOO_LARGE');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw fail('The registry image is too large to import.', 'PRODUCT_IMAGE_TOO_LARGE');
  }
  return buffer;
};

export const buildImportExternalProductImageUseCase = ({
  lookupExternalProduct,
  uploadStorefrontCatalogImage,
  fetchImpl = globalThis.fetch,
  allowedImageHosts = DEFAULT_ALLOWED_IMAGE_HOSTS,
  timeoutMs = Number(process.env.OPEN_FOOD_FACTS_IMAGE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  maxBytes = STOREFRONT_CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES
} = {}) => {
  if (typeof lookupExternalProduct !== 'function') throw new Error('lookupExternalProduct is required');
  if (typeof uploadStorefrontCatalogImage !== 'function') throw new Error('uploadStorefrontCatalogImage is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required');

  const allowedHosts = new Set(allowedImageHosts.map((host) => String(host).trim().toLowerCase()).filter(Boolean));

  return async ({ itemId, code, user }) => {
    const lookup = await lookupExternalProduct({ code, includeSuggestedPrice: false });
    const imageUrlValue = lookup?.product?.image_url;
    if (!lookup?.found || !imageUrlValue) {
      throw fail('No registry product image is available for this barcode.', 'PRODUCT_IMAGE_UNAVAILABLE');
    }

    let imageUrl;
    try {
      imageUrl = new URL(imageUrlValue);
    } catch {
      throw fail('The registry returned an invalid product image URL.', 'PRODUCT_IMAGE_URL_INVALID');
    }
    if (imageUrl.protocol !== 'https:' || !allowedHosts.has(imageUrl.hostname.toLowerCase())) {
      throw fail('The registry image source is not approved for import.', 'PRODUCT_IMAGE_SOURCE_NOT_ALLOWED');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let tempPath = null;
    try {
      const response = await fetchImpl(imageUrl.toString(), {
        method: 'GET',
        headers: { Accept: SAFE_IMAGE_MIME_TYPES.join(', ') },
        redirect: 'error',
        signal: controller.signal
      });
      if (!response.ok) {
        throw fail('The registry image could not be downloaded.', 'PRODUCT_IMAGE_DOWNLOAD_FAILED', 503);
      }

      const mime = normalizeMime(response.headers?.get?.('content-type'));
      if (!SAFE_IMAGE_MIME_TYPES.includes(mime)) {
        throw fail('The registry image format is not supported.', 'PRODUCT_IMAGE_FORMAT_UNSUPPORTED');
      }
      const contentLength = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw fail('The registry image is too large to import.', 'PRODUCT_IMAGE_TOO_LARGE');
      }

      const body = await readLimitedBody(response, maxBytes);
      tempPath = path.join(UPLOAD_TEMP_DIR, `dgfy-registry-image-${randomUUID()}${MIME_EXTENSION[mime] || ''}`);
      await fs.mkdir(UPLOAD_TEMP_DIR, { recursive: true });
      await fs.writeFile(tempPath, body, { flag: 'wx' });

      const importedAt = new Date().toISOString();
      return await uploadStorefrontCatalogImage({
        itemId,
        user,
        file: {
          path: tempPath,
          originalname: `registry-${lookup.code}${MIME_EXTENSION[mime] || ''}`,
          mimetype: mime,
          size: body.length
        },
        provenance: {
          type: 'external_registry',
          provider: lookup.provider || null,
          barcode: lookup.code,
          product_url: lookup.product?.provider_product_url || null,
          source_image_url: imageUrl.toString(),
          attribution_label: lookup.attribution?.label || null,
          attribution_url: lookup.attribution?.url || null,
          database_license: lookup.attribution?.database_license || null,
          image_license: lookup.attribution?.image_license || null,
          imported_at: importedAt
        }
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw fail('The registry image download timed out.', 'PRODUCT_IMAGE_DOWNLOAD_TIMEOUT', 503);
      }
      if (error instanceof DomainError) throw error;
      throw fail('The registry image could not be imported.', 'PRODUCT_IMAGE_IMPORT_FAILED', 503);
    } finally {
      clearTimeout(timeout);
      if (tempPath) await fs.unlink(tempPath).catch(() => {});
    }
  };
};

export default buildImportExternalProductImageUseCase;
