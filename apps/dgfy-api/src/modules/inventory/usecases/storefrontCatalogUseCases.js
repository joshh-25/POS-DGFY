import fs from 'fs/promises';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  SAFE_IMAGE_MIME_TYPES,
  validateImageUploadFile
} from '../../shared/utils/imageUploadValidation.js';
import { requireExplicitSalePrice } from '../../shared/utils/itemFinancialPolicy.js';
import { resolveStorefrontCatalogVisibility } from '../../shared/utils/catalogVisibilityPolicy.js';
import logger from '../../../config/logger.js';

const PERMISSION_EDIT_ITEMS = 'items:edit';
const STOREFRONT_CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES = 100 * 1024 * 1024;
const STOREFRONT_CATALOG_GALLERY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const STOREFRONT_CATALOG_GALLERY_MAX_IMAGES = 5;
const BULK_CATALOG_MAX_ITEM_IDS = 500;
const BULK_CATALOG_MAX_IMAGE_FILES = 50;

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const hasPermission = (user, permission) => {
  if (user?.is_master_admin === true) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.includes(permission);
};

const toSerializable = (value) => (
  value && typeof value.toJSON === 'function'
    ? value.toJSON()
    : value
);

const normalizeBulkItemIds = (itemIds) => {
  if (!Array.isArray(itemIds)) return null;
  return [...new Set(itemIds.map((itemId) => parsePositiveInt(itemId)).filter(Boolean))];
};

const getSkuStem = (file = {}) => {
  const originalName = String(file?.originalname || '').trim();
  const lastDot = originalName.lastIndexOf('.');
  return (lastDot > 0 ? originalName.slice(0, lastDot) : originalName).trim();
};

const cleanupTempFile = async (file) => {
  if (!file?.path) return;
  try {
    await fs.unlink(file.path);
  } catch {
    // Best-effort temp cleanup.
  }
};

const createBulkImageSummary = () => ({
  uploaded: 0,
  failed: 0,
  unmatched: 0,
  duplicate_filename: 0,
  blocked_readiness: 0
});

const parseGalleryEntries = (entries = []) => {
  if (Array.isArray(entries)) return entries;
  if (typeof entries !== 'string') return [];

  try {
    const parsed = JSON.parse(entries);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeStoredGalleryEntries = (entries = []) => parseGalleryEntries(entries)
  .map((entry, index) => ({
    path: entry?.path || null,
    url: entry?.url || null,
    variants: entry?.variants && typeof entry.variants === 'object' ? entry.variants : null,
    original_path: entry?.original_path || null,
    classification: entry?.classification || null,
    is_primary: index === 0,
    sort_order: index
  }))
  .filter((entry) => entry.path || entry.url);

const normalizeGalleryPayloadEntries = (entries = []) => normalizeStoredGalleryEntries(entries)
  .map((entry, index) => ({
    ...entry,
    is_primary: index === 0,
    sort_order: index
  }));

const normalizeExistingStorefrontGallery = (override = {}) => {
  const gallery = normalizeStoredGalleryEntries(override?.storefront_image_gallery || []);
  const primaryUrl = override?.storefront_image_url || null;
  const primaryPath = override?.storefront_image_path || null;
  const hasPrimary = primaryUrl || primaryPath;
  if (!hasPrimary) return gallery;

  const containsPrimary = gallery.some((entry) => (
    (primaryPath && entry.path === primaryPath)
    || (primaryUrl && entry.url === primaryUrl)
  ));
  const nextGallery = containsPrimary
    ? gallery
    : [{ path: primaryPath, url: primaryUrl }, ...gallery];

  return normalizeStoredGalleryEntries(nextGallery);
};

const storefrontReadinessError = ({ item, itemId, cause = null }) => new DomainError(
  DomainErrorCode.VALIDATION_FAILED,
  'Cannot enable Storefront visibility until readiness requirements are completed.',
  {
    statusCode: 422,
    details: {
      reason_code: 'STOREFRONT_READINESS_INCOMPLETE',
      missing_requirements: [{
        code: 'SALE_PRICE_MISSING',
        label: 'Set a sale price'
      }],
      readiness_snapshot: {
        ready: false,
        checks: {
          has_sale_price: false
        },
        item_id: itemId,
        default_sale_price: item?.default_sale_price ?? null
      },
      price_error: cause?.details || null
    }
  }
);

const assertStorefrontPriceReady = (item, itemId, context) => {
  try {
    requireExplicitSalePrice(item, context);
  } catch (error) {
    if (error instanceof DomainError) {
      throw storefrontReadinessError({ item, itemId, cause: error });
    }
    throw error;
  }
};

const assertCanEditItems = (user, action) => {
  if (!hasPermission(user, PERMISSION_EDIT_ITEMS)) {
    throw new DomainError(
      DomainErrorCode.AUTHORIZATION_FAILED,
      `You do not have permission to ${action} storefront catalog items.`,
      { statusCode: 403 }
    );
  }
};

export const buildListStorefrontCatalogOverridesUseCase = ({ itemRepository }) => {
  return async ({ query = {} } = {}) => itemRepository.listStorefrontCatalogOverrides(query);
};

export const buildUpdateStorefrontCatalogOverrideUseCase = ({ itemRepository }) => {
  return async ({ itemId, payload = {}, user }) => {
    assertCanEditItems(user, 'update');
    const normalizedItemId = parsePositiveInt(itemId);
    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'itemId must be a positive integer', { statusCode: 400 });
    }

    const item = await itemRepository.getItemById(normalizedItemId);
    if (!item) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, `Item ${normalizedItemId} was not found`, { statusCode: 404 });
    }

    const hasStorefrontVisiblePatch = typeof payload.storefront_visible === 'boolean';
    const hasLocationAvailabilityPatch = Array.isArray(payload.location_availability);

    if (!hasStorefrontVisiblePatch && !hasLocationAvailabilityPatch) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'storefront_visible or location_availability is required',
        { statusCode: 400 }
      );
    }

    if (payload.storefront_visible === true) {
      assertStorefrontPriceReady(item, normalizedItemId, 'Storefront visibility');
    }

    const shouldUseTransaction = hasStorefrontVisiblePatch
      && hasLocationAvailabilityPatch
      && typeof itemRepository.beginTransaction === 'function';
    const transaction = shouldUseTransaction ? await itemRepository.beginTransaction() : null;

    try {
      const repositoryOptions = transaction ? { transaction } : {};
      const data = hasStorefrontVisiblePatch
        ? await itemRepository.upsertStorefrontCatalogOverride(
          normalizedItemId,
          { storefront_visible: payload.storefront_visible },
          ...(transaction ? [repositoryOptions] : [])
        )
        : await itemRepository.findStorefrontCatalogOverrideByItemId(
          normalizedItemId,
          ...(transaction ? [repositoryOptions] : [])
        );

      if (hasLocationAvailabilityPatch) {
        await itemRepository.upsertStorefrontItemLocationAvailability(
          normalizedItemId,
          payload.location_availability,
          ...(transaction ? [repositoryOptions] : [])
        );
      }

      const availabilityByItemId = typeof itemRepository.listStorefrontItemLocationAvailability === 'function'
        ? await itemRepository.listStorefrontItemLocationAvailability(
          [normalizedItemId],
          ...(transaction ? [repositoryOptions] : [])
        )
        : new Map();

      if (transaction) await transaction.commit();

      return {
        ...toSerializable(data || { item_id: normalizedItemId }),
        item_id: normalizedItemId,
        location_availability: availabilityByItemId.get(normalizedItemId) || []
      };
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  };
};

export const buildUpdateBulkStorefrontCatalogOverridesUseCase = ({ itemRepository }) => {
  return async ({ payload = {}, user }) => {
    assertCanEditItems(user, 'update');
    const itemIds = normalizeBulkItemIds(payload.item_ids);
    if (!itemIds || itemIds.length === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'item_ids must contain at least one positive integer', { statusCode: 400 });
    }
    if (itemIds.length > BULK_CATALOG_MAX_ITEM_IDS) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `item_ids cannot exceed ${BULK_CATALOG_MAX_ITEM_IDS} entries`, { statusCode: 400 });
    }
    if (typeof payload.storefront_visible !== 'boolean') {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'storefront_visible must be a boolean', { statusCode: 400 });
    }

    const results = [];
    for (const itemId of itemIds) {
      try {
        const readinessEnvelope = await itemRepository.getStorefrontCatalogReadinessByItemId(itemId, {
          forcedStorefrontVisible: payload.storefront_visible === true ? true : null
        });
        if (!readinessEnvelope) {
          results.push({ item_id: itemId, status: 'not_found', errors: ['Item was not found'] });
          continue;
        }

        if (payload.storefront_visible === true && readinessEnvelope.storefront_readiness?.ready !== true) {
          results.push({
            item_id: itemId,
            status: 'blocked',
            errors: ['Storefront readiness is incomplete'],
            readiness_snapshot: readinessEnvelope.storefront_readiness
          });
          continue;
        }

        const updated = await itemRepository.upsertStorefrontCatalogOverride(itemId, {
          storefront_visible: payload.storefront_visible
        });
        results.push({
          item_id: itemId,
          status: 'updated',
          data: toSerializable(updated)
        });
      } catch (error) {
        results.push({
          item_id: itemId,
          status: 'failed',
          errors: [error?.message || 'Failed to update item']
        });
      }
    }

    return {
      summary: {
        updated: results.filter((entry) => entry.status === 'updated').length,
        blocked: results.filter((entry) => entry.status === 'blocked').length,
        not_found: results.filter((entry) => entry.status === 'not_found').length,
        failed: results.filter((entry) => entry.status === 'failed').length
      },
      results
    };
  };
};

export const buildUploadStorefrontCatalogImageUseCase = ({ itemRepository, imageStorage }) => {
  return async ({ itemId, file, user }) => {
    const normalizedItemId = parsePositiveInt(itemId);
    let stored = null;
    let storedCommitted = false;
    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'itemId must be a positive integer', { statusCode: 400 });
    }
    if (!file) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'image file is required', { statusCode: 400 });
    }

    try {
      assertCanEditItems(user, 'upload images for');

      const fileValidation = await validateImageUploadFile({
        file,
        allowedMimeTypes: SAFE_IMAGE_MIME_TYPES,
        maxBytes: STOREFRONT_CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES
      });
      if (!fileValidation.ok) {
        logger.warn('[StorefrontCatalogUseCases] Rejected storefront catalog image upload due to file validation failure', {
          event_type: 'security_signal',
          signal_code: 'storefront_catalog_image_upload_rejected',
          reason: fileValidation.reason,
          reported_mime: String(file?.mimetype || '').trim().toLowerCase() || null,
          original_name: String(file?.originalname || '').slice(0, 180) || null
        });
        throw new DomainError(
          DomainErrorCode.VALIDATION_FAILED,
          'Only image files are allowed for storefront catalog uploads.',
          { statusCode: 422 }
        );
      }

      const item = await itemRepository.getItemById(normalizedItemId);
      if (!item) {
        throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, `Item ${normalizedItemId} was not found`, { statusCode: 404 });
      }

      const existing = await itemRepository.findStorefrontCatalogOverrideByItemId(normalizedItemId);
      const effective = existing
        ? { storefront_visible: existing.storefront_visible !== false }
        : await itemRepository.getStorefrontCatalogReadinessByItemId(normalizedItemId);

      if (effective?.storefront_visible !== false) {
        assertStorefrontPriceReady(item, normalizedItemId, 'Storefront image visibility');
      }

      stored = await imageStorage.store({
        itemId: normalizedItemId,
        originalName: file.originalname,
        reportedMime: file.mimetype,
        tempPath: file.path
      });

      const data = await itemRepository.updateStorefrontCatalogImage(normalizedItemId, {
        path: stored.path,
        url: stored.url
      }, {
        keepVisible: effective?.storefront_visible !== false
      });
      storedCommitted = true;

      if (existing?.storefront_image_path && existing.storefront_image_path !== stored.path) {
        try {
          await imageStorage.remove({ path: existing.storefront_image_path });
        } catch (cleanupError) {
          logger.warn('[StorefrontCatalogUseCases] Failed to remove previous storefront catalog image after replacement', {
            event_type: 'storefront_catalog_image_cleanup_failed',
            item_id: normalizedItemId,
            reason: cleanupError?.message || 'unknown'
          });
        }
      }

      const response = toSerializable(data);
      response.storefront_image_variants = stored.image_variants || null;
      response.storefront_image_original_path = stored.original?.path || null;
      response.storefront_image_classification = stored.classification || null;
      return response;
    } catch (error) {
      if (stored && !storedCommitted) {
        try {
          await imageStorage.remove({ path: stored.path });
        } catch {
          // Ignore stored upload cleanup errors.
        }
      }
      if (file?.path) {
        try {
          await fs.unlink(file.path);
        } catch {
          // Ignore temp cleanup errors.
        }
      }
      throw error;
    }
  };
};

export const buildUploadStorefrontCatalogGalleryImagesUseCase = ({ itemRepository, imageStorage }) => {
  return async ({ itemId, files = [], user }) => {
    const normalizedItemId = parsePositiveInt(itemId);
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    const storedImages = [];
    let storedCommitted = false;

    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'itemId must be a positive integer', { statusCode: 400 });
    }
    if (normalizedFiles.length === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'images must contain at least one file', { statusCode: 400 });
    }
    if (normalizedFiles.length > STOREFRONT_CATALOG_GALLERY_MAX_IMAGES) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Item images cannot exceed ${STOREFRONT_CATALOG_GALLERY_MAX_IMAGES} files per item.`, { statusCode: 422 });
    }

    try {
      assertCanEditItems(user, 'upload images for');

      const item = await itemRepository.getItemById(normalizedItemId);
      if (!item) {
        throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, `Item ${normalizedItemId} was not found`, { statusCode: 404 });
      }

      const existing = await itemRepository.findStorefrontCatalogOverrideByItemId(normalizedItemId);
      const existingGallery = normalizeExistingStorefrontGallery(existing);
      if (existingGallery.length + normalizedFiles.length > STOREFRONT_CATALOG_GALLERY_MAX_IMAGES) {
        throw new DomainError(
          DomainErrorCode.VALIDATION_FAILED,
          `Item image gallery is limited to ${STOREFRONT_CATALOG_GALLERY_MAX_IMAGES} images per item.`,
          {
            statusCode: 422,
            details: {
              reason_code: 'STOREFRONT_GALLERY_LIMIT_EXCEEDED',
              max_images: STOREFRONT_CATALOG_GALLERY_MAX_IMAGES,
              existing_count: existingGallery.length,
              requested_count: normalizedFiles.length
            }
          }
        );
      }
      const effective = existing
        ? { storefront_visible: existing.storefront_visible !== false }
        : await itemRepository.getStorefrontCatalogReadinessByItemId(normalizedItemId);

      if (effective?.storefront_visible !== false) {
        assertStorefrontPriceReady(item, normalizedItemId, 'Storefront image visibility');
      }

      for (const file of normalizedFiles) {
        const fileValidation = await validateImageUploadFile({
          file,
          allowedMimeTypes: SAFE_IMAGE_MIME_TYPES,
          maxBytes: STOREFRONT_CATALOG_GALLERY_IMAGE_MAX_BYTES
        });
        if (!fileValidation.ok) {
          logger.warn('[StorefrontCatalogUseCases] Rejected storefront catalog gallery upload due to file validation failure', {
            event_type: 'security_signal',
            signal_code: 'storefront_catalog_gallery_upload_rejected',
            reason: fileValidation.reason,
            reported_mime: String(file?.mimetype || '').trim().toLowerCase() || null,
            original_name: String(file?.originalname || '').slice(0, 180) || null
          });
          throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Only image files are allowed for storefront catalog uploads.',
            { statusCode: 422 }
          );
        }

        const stored = await imageStorage.store({
          itemId: normalizedItemId,
          originalName: file.originalname,
          reportedMime: file.mimetype,
          tempPath: file.path
        });
        storedImages.push(stored);
      }

      const gallery = normalizeStoredGalleryEntries([...existingGallery, ...storedImages.map((stored) => ({
        path: stored.path,
        url: stored.url,
        variants: stored.image_variants,
        original_path: stored.original?.path || null,
        classification: stored.classification || null
      }))]);
      const primary = gallery[0] || null;
      const data = await itemRepository.updateStorefrontCatalogImage(normalizedItemId, {
        path: primary?.path || null,
        url: primary?.url || null,
        gallery
      }, {
        keepVisible: effective?.storefront_visible !== false
      });
      storedCommitted = true;

      const response = toSerializable(data);
      response.storefront_image_variants = primary?.variants || null;
      response.storefront_image_original_path = primary?.original_path || null;
      response.storefront_image_classification = primary?.classification || null;
      return response;
    } catch (error) {
      if (!storedCommitted) {
        await Promise.all(storedImages.map(async (stored) => {
          try {
            await imageStorage.remove({ path: stored.path });
          } catch {
            // Ignore stored upload cleanup errors.
          }
        }));
      }
      await Promise.all(normalizedFiles.map((file) => cleanupTempFile(file)));
      throw error;
    }
  };
};

export const buildUploadBulkStorefrontCatalogImagesUseCase = ({ itemRepository, imageStorage }) => {
  return async ({ files = [], user }) => {
    assertCanEditItems(user, 'upload images for');
    const normalizedFiles = Array.isArray(files) ? files : [];
    if (normalizedFiles.length === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'images must contain at least one file', { statusCode: 400 });
    }
    if (normalizedFiles.length > BULK_CATALOG_MAX_IMAGE_FILES) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `images cannot exceed ${BULK_CATALOG_MAX_IMAGE_FILES} files`, { statusCode: 400 });
    }

    try {
      const duplicateStems = new Set();
      const seenStems = new Set();
      normalizedFiles.forEach((file) => {
        const stem = getSkuStem(file).toUpperCase();
        if (!stem) return;
        if (seenStems.has(stem)) duplicateStems.add(stem);
        seenStems.add(stem);
      });

      const skuCodes = [...seenStems].filter((stem) => !duplicateStems.has(stem));
      const items = await itemRepository.findItemsBySkuCodes(skuCodes);
      const itemBySku = new Map((items || []).map((item) => {
        const payload = toSerializable(item);
        return [String(payload?.sku_code || '').trim().toUpperCase(), payload];
      }));
      const summary = createBulkImageSummary();
      const results = [];

      for (const file of normalizedFiles) {
        const skuCode = getSkuStem(file);
        const skuKey = skuCode.toUpperCase();
        let stored = null;
        let storedCommitted = false;

        try {
          if (duplicateStems.has(skuKey)) {
            await cleanupTempFile(file);
            summary.duplicate_filename += 1;
            results.push({
              filename: file.originalname,
              sku_code: skuCode || null,
              item_id: null,
              surface: 'storefront',
              status: 'duplicate_filename',
              image_url: null,
              errors: ['Duplicate SKU filename in upload batch'],
              readiness_snapshot: null
            });
            continue;
          }

          const item = itemBySku.get(skuKey);
          if (!item) {
            await cleanupTempFile(file);
            summary.unmatched += 1;
            results.push({
              filename: file.originalname,
              sku_code: skuCode || null,
              item_id: null,
              surface: 'storefront',
              status: 'unmatched',
              image_url: null,
              errors: ['No item matched this SKU filename'],
              readiness_snapshot: null
            });
            continue;
          }

          const fileValidation = await validateImageUploadFile({
            file,
            allowedMimeTypes: SAFE_IMAGE_MIME_TYPES,
            maxBytes: STOREFRONT_CATALOG_GALLERY_IMAGE_MAX_BYTES
          });
          if (!fileValidation.ok) {
            await cleanupTempFile(file);
            summary.failed += 1;
            results.push({
              filename: file.originalname,
              sku_code: skuCode,
              item_id: item.item_id,
              surface: 'storefront',
              status: 'failed',
              image_url: null,
              errors: ['Only image files are allowed for storefront catalog uploads.'],
              readiness_snapshot: null
            });
            continue;
          }

          const existing = await itemRepository.findStorefrontCatalogOverrideByItemId(item.item_id);
          const effectiveVisible = resolveStorefrontCatalogVisibility({
            item,
            override: existing || null,
            legacyPosOverride: null
          }) !== false;
          const readinessEnvelope = await itemRepository.getStorefrontCatalogReadinessByItemId(item.item_id);
          if (effectiveVisible && readinessEnvelope?.storefront_readiness?.checks?.has_sale_price !== true) {
            await cleanupTempFile(file);
            summary.blocked_readiness += 1;
            results.push({
              filename: file.originalname,
              sku_code: skuCode,
              item_id: item.item_id,
              surface: 'storefront',
              status: 'blocked_readiness',
              image_url: null,
              errors: ['Visible Storefront items need a customer sale price before image upload.'],
              readiness_snapshot: readinessEnvelope?.storefront_readiness || null
            });
            continue;
          }

          stored = await imageStorage.store({
            itemId: item.item_id,
            originalName: file.originalname,
            reportedMime: file.mimetype,
            tempPath: file.path
          });
          const updated = await itemRepository.updateStorefrontCatalogImage(item.item_id, {
            path: stored.path,
            url: stored.url
          }, {
            keepVisible: effectiveVisible
          });
          storedCommitted = true;

          if (existing?.storefront_image_path && existing.storefront_image_path !== stored.path) {
            try {
              await imageStorage.remove({ path: existing.storefront_image_path });
            } catch {
              // Best-effort cleanup of replaced image.
            }
          }

          summary.uploaded += 1;
          results.push({
            filename: file.originalname,
            sku_code: skuCode,
            item_id: item.item_id,
            surface: 'storefront',
            status: 'uploaded',
            image_url: stored.url,
            image_variants: stored.image_variants || null,
            image_original_path: stored.original?.path || null,
            image_classification: stored.classification || null,
            errors: [],
            readiness_snapshot: readinessEnvelope?.storefront_readiness || null,
            data: toSerializable(updated)
          });
        } catch (error) {
          if (stored && !storedCommitted) {
            try {
              await imageStorage.remove({ path: stored.path });
            } catch {
              // Best-effort cleanup.
            }
          }
          await cleanupTempFile(file);
          summary.failed += 1;
          results.push({
            filename: file.originalname,
            sku_code: skuCode || null,
            item_id: itemBySku.get(skuKey)?.item_id || null,
            surface: 'storefront',
            status: 'failed',
            image_url: null,
            errors: [error?.message || 'Failed to upload image'],
            readiness_snapshot: null
          });
        }
      }

      return { summary, results };
    } catch (error) {
      await Promise.all(normalizedFiles.map((file) => cleanupTempFile(file)));
      throw error;
    }
  };
};

export const buildUpdateStorefrontCatalogGalleryUseCase = ({ itemRepository, imageStorage }) => {
  return async ({ itemId, payload = {}, user }) => {
    assertCanEditItems(user, 'update images for');
    const normalizedItemId = parsePositiveInt(itemId);
    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'itemId must be a positive integer', { statusCode: 400 });
    }

    const item = await itemRepository.getItemById(normalizedItemId);
    if (!item) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, `Item ${normalizedItemId} was not found`, { statusCode: 404 });
    }

    const existing = await itemRepository.findStorefrontCatalogOverrideByItemId(normalizedItemId);
    const existingGallery = normalizeExistingStorefrontGallery(existing);
    const requestedGallery = normalizeGalleryPayloadEntries(payload.gallery || payload.storefront_image_gallery || []);
    if (requestedGallery.length === 0) {
      const paths = [
        existing?.storefront_image_path,
        ...existingGallery.map((entry) => entry.path)
      ].filter(Boolean);
      await Promise.all([...new Set(paths)].map((path) => imageStorage.remove({ path })));
      const data = await itemRepository.clearStorefrontCatalogImage(normalizedItemId);
      return toSerializable(data);
    }

    const existingKeys = new Set(existingGallery.map((entry) => entry.path || entry.url).filter(Boolean));
    const containsUnknownEntry = requestedGallery.some((entry) => !existingKeys.has(entry.path || entry.url));
    if (containsUnknownEntry) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Gallery updates can only reorder or remove existing storefront images.',
        { statusCode: 422 }
      );
    }

    const primary = requestedGallery[0] || null;
    const data = await itemRepository.upsertStorefrontCatalogOverride(normalizedItemId, {
      storefront_image_path: primary?.path || null,
      storefront_image_url: primary?.url || null,
      storefront_image_gallery: requestedGallery
    });

    const requestedPaths = new Set(requestedGallery.map((entry) => entry.path).filter(Boolean));
    const removedPaths = [
      existing?.storefront_image_path,
      ...existingGallery.map((entry) => entry.path)
    ].filter((path) => path && !requestedPaths.has(path));
    await Promise.all([...new Set(removedPaths)].map((path) => imageStorage.remove({ path })));

    return toSerializable(data);
  };
};

export const buildDeleteStorefrontCatalogGalleryImageUseCase = ({ itemRepository, imageStorage }) => {
  return async ({ itemId, imageIndex, user }) => {
    assertCanEditItems(user, 'delete images for');
    const normalizedItemId = parsePositiveInt(itemId);
    const normalizedImageIndex = Number.parseInt(imageIndex, 10);
    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'itemId must be a positive integer', { statusCode: 400 });
    }
    if (!Number.isInteger(normalizedImageIndex) || normalizedImageIndex < 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'imageIndex must be a non-negative integer', { statusCode: 400 });
    }

    const existing = await itemRepository.findStorefrontCatalogOverrideByItemId(normalizedItemId);
    const existingGallery = normalizeExistingStorefrontGallery(existing);
    if (normalizedImageIndex >= existingGallery.length) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Storefront gallery image was not found', { statusCode: 404 });
    }

    const removed = existingGallery[normalizedImageIndex];
    const nextGallery = normalizeStoredGalleryEntries(existingGallery.filter((_, index) => index !== normalizedImageIndex));
    const primary = nextGallery[0] || null;
    const data = nextGallery.length > 0
      ? await itemRepository.upsertStorefrontCatalogOverride(normalizedItemId, {
        storefront_image_path: primary?.path || null,
        storefront_image_url: primary?.url || null,
        storefront_image_gallery: nextGallery
      })
      : await itemRepository.clearStorefrontCatalogImage(normalizedItemId);

    if (removed?.path) {
      await imageStorage.remove({ path: removed.path });
    }

    return toSerializable(data);
  };
};

export const buildDeleteStorefrontCatalogImageUseCase = ({ itemRepository, imageStorage }) => {
  return async ({ itemId, user }) => {
    assertCanEditItems(user, 'delete images for');
    const normalizedItemId = parsePositiveInt(itemId);
    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'itemId must be a positive integer', { statusCode: 400 });
    }

    const existing = await itemRepository.findStorefrontCatalogOverrideByItemId(normalizedItemId);
    const existingGallery = normalizeExistingStorefrontGallery(existing);
    const paths = [
      existing?.storefront_image_path,
      ...existingGallery.map((entry) => entry.path)
    ].filter(Boolean);
    await Promise.all([...new Set(paths)].map((path) => imageStorage.remove({ path })));

    const data = await itemRepository.clearStorefrontCatalogImage(normalizedItemId);
    return toSerializable(data);
  };
};
