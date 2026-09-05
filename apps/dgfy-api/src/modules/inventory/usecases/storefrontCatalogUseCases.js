import fs from 'fs/promises';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  SAFE_IMAGE_MIME_TYPES,
  validateImageUploadFile
} from '../../shared/utils/imageUploadValidation.js';
import { parseBulkCatalogFilename, groupBulkCatalogFilesBySku } from '../../shared/utils/bulkCatalogImageFilename.js';
import { requireExplicitSalePrice } from '../../shared/utils/itemFinancialPolicy.js';
import { resolveStorefrontCatalogVisibility } from '../../shared/utils/catalogVisibilityPolicy.js';
import logger from '../../../config/logger.js';
import { resolveEffectivePermissions } from '../../../utils/userPermissions.js';
import { requireItemImageGenerationConfig } from '../../../config/itemImageFeature.js';

const PERMISSION_EDIT_ITEMS = 'items:edit';
export const STOREFRONT_CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES = 100 * 1024 * 1024;
const STOREFRONT_CATALOG_GALLERY_IMAGE_MAX_BYTES = STOREFRONT_CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES;
const BULK_CATALOG_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
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

const writeCatalogAudit = async ({
  itemRepository,
  user,
  item,
  entityType = 'item_storefront_catalog_override',
  eventType,
  action = 'UPDATE',
  changes = {},
  transaction = null
}) => {
  if (typeof itemRepository.createAuditLog !== 'function') return;
  await itemRepository.createAuditLog({
    user_id: user?.user_id || null,
    entity_type: entityType,
    entity_id: item?.item_id || changes.item_id || null,
    action,
    event_type: eventType,
    changes: {
      item_id: item?.item_id || changes.item_id || null,
      item_name: item?.name || null,
      surface: 'storefront',
      ...changes
    }
  }, transaction ? { transaction } : {});
};

// itemImageWorker.js runs minutes later with no request context, so it needs
// an explicit permissions array rather than a role it could re-resolve
// against defaults that may since have changed — same reasoning as
// menuImportController.js's enqueueGeneratedImages(). Resolved once here so
// every caller of the two generate-image use cases below builds the
// enqueue payload identically.
const buildGenerationUser = (user) => ({
  user_id: user?.user_id,
  tenant_id: user?.tenant_id,
  is_master_admin: user?.is_master_admin === true,
  permissions: resolveEffectivePermissions(user)
});

const normalizeBulkItemIds = (itemIds) => {
  if (!Array.isArray(itemIds)) return null;
  return [...new Set(itemIds.map((itemId) => parsePositiveInt(itemId)).filter(Boolean))];
};

const cleanupTempFile = async (file) => {
  if (!file?.path) return;
  try {
    await fs.unlink(file.path);
  } catch {
    // Best-effort temp cleanup.
  }
};

const buildStorefrontImageFailure = ({
  error,
  code,
  message,
  reasonCode,
  itemId,
  file,
  user
}) => {
  logger.error('Storefront catalog image operation failed', {
    event_type: 'storefront_catalog_image_operation_failed',
    item_id: itemId,
    tenant_id: user?.tenant_id || null,
    failure_code: code,
    reason_code: reasonCode,
    original_name: String(file?.originalname || '').slice(0, 180) || null,
    reported_mime: String(file?.mimetype || '').trim().toLowerCase() || null,
    file_size: Number.isFinite(file?.size) ? file.size : null,
    cause_code: error?.code || null,
    cause_message: error?.message || 'Unknown image operation error',
    cause_stack: error?.stack || null
  });

  return new DomainError(code, message, {
    statusCode: 500,
    details: {
      reason_code: reasonCode,
      item_id: itemId
    },
    cause: error
  });
};

const createBulkImageSummary = () => ({
  uploaded: 0,
  failed: 0,
  unmatched: 0,
  duplicate_filename: 0,
  // Phase 299 (#265): distinct from duplicate_filename above -- fires only when the collision
  // involves the new <SKU>__<variant>.<ext> suffix convention (two files claiming the same
  // variant slot for one SKU), never for two plain <SKU>.<ext> files sharing a stem, which stays
  // duplicate_filename exactly as before this phase.
  duplicate_variant_for_sku: 0,
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
    source: entry?.source && typeof entry.source === 'object'
      ? {
          type: String(entry.source.type || '').trim() || null,
          provider: String(entry.source.provider || '').trim() || null,
          barcode: String(entry.source.barcode || '').trim() || null,
          product_url: String(entry.source.product_url || '').trim() || null,
          source_image_url: String(entry.source.source_image_url || '').trim() || null,
          attribution_label: String(entry.source.attribution_label || '').trim() || null,
          attribution_url: String(entry.source.attribution_url || '').trim() || null,
          database_license: String(entry.source.database_license || '').trim() || null,
          image_license: String(entry.source.image_license || '').trim() || null,
          imported_at: String(entry.source.imported_at || '').trim() || null
        }
      : null,
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

      await writeCatalogAudit({
        itemRepository,
        user,
        item,
        eventType: 'storefront_catalog_override_updated',
        changes: {
          ...(hasStorefrontVisiblePatch ? { storefront_visible: payload.storefront_visible } : {}),
          ...(hasLocationAvailabilityPatch ? { location_availability: payload.location_availability } : {})
        },
        transaction
      });

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
        await writeCatalogAudit({
          itemRepository,
          user,
          item: readinessEnvelope,
          eventType: 'storefront_catalog_override_updated',
          changes: {
            item_id: itemId,
            storefront_visible: payload.storefront_visible,
            bulk_update: true
          }
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
  // Phase 299 (#265): accepts either the legacy singular `file` (itemImageWorker.js's
  // generated-image path still calls this way, unchanged and out of scope for this phase) or the
  // new `.fields()`-shaped `files` object (`{ image: [...], image_medium?: [...],
  // image_thumbnail?: [...] }`) itemHandlers.js now sends for the manual-upload route --
  // `files.image[0]` wins when both are present. `clientImageManifest` is the parsed hint bag from
  // imageUploadValidation.js's parseClientImageManifest (null when absent/malformed).
  return async ({ itemId, file = null, files = null, clientImageManifest = null, user, provenance = null }) => {
    const normalizedItemId = parsePositiveInt(itemId);
    const resolvedFile = files?.image?.[0] || file;
    const mediumFile = files?.image_medium?.[0] || null;
    const thumbnailFile = files?.image_thumbnail?.[0] || null;
    let stored = null;
    let storedCommitted = false;
    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'itemId must be a positive integer', { statusCode: 400 });
    }
    if (!resolvedFile) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'image file is required', { statusCode: 400 });
    }

    try {
      assertCanEditItems(user, 'upload images for');

      const fileValidation = await validateImageUploadFile({
        file: resolvedFile,
        allowedMimeTypes: SAFE_IMAGE_MIME_TYPES,
        maxBytes: STOREFRONT_CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES
      });
      if (!fileValidation.ok) {
        logger.warn('[StorefrontCatalogUseCases] Rejected storefront catalog image upload due to file validation failure', {
          event_type: 'security_signal',
          signal_code: 'storefront_catalog_image_upload_rejected',
          reason: fileValidation.reason,
          reported_mime: String(resolvedFile?.mimetype || '').trim().toLowerCase() || null,
          original_name: String(resolvedFile?.originalname || '').slice(0, 180) || null
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
        originalName: resolvedFile.originalname,
        reportedMime: resolvedFile.mimetype,
        tempPath: resolvedFile.path,
        sourceMimeHint: clientImageManifest?.sourceMimeHint || null,
        acceptedAsClientLarge: clientImageManifest?.largePreOptimized === true,
        clientVariantFiles: (mediumFile || thumbnailFile) ? {
          ...(mediumFile ? { medium: { tempPath: mediumFile.path, reportedMime: mediumFile.mimetype } } : {}),
          ...(thumbnailFile ? { thumbnail: { tempPath: thumbnailFile.path, reportedMime: thumbnailFile.mimetype } } : {})
        } : null
      });

      const data = await itemRepository.updateStorefrontCatalogImage(normalizedItemId, {
        path: stored.path,
        url: stored.url,
        gallery: [{
          path: stored.path,
          url: stored.url,
          variants: stored.image_variants || null,
          original_path: stored.original?.path || null,
          classification: stored.classification || null,
          source: provenance && typeof provenance === 'object'
            ? provenance
            : { type: 'manual_upload' }
        }]
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
      await writeCatalogAudit({
        itemRepository,
        user,
        item,
        entityType: 'item_catalog_image',
        eventType: 'item_catalog_image_uploaded',
        action: 'CREATE',
        changes: {
          original_filename: String(resolvedFile.originalname || '').slice(0, 180) || null,
          replaced_existing_image: Boolean(existing?.storefront_image_path),
          image_source: provenance?.type || 'manual_upload'
        }
      });
      return response;
    } catch (error) {
      if (stored && !storedCommitted) {
        try {
          await imageStorage.remove({ path: stored.path });
        } catch {
          // Ignore stored upload cleanup errors.
        }
      }
      if (resolvedFile?.path) {
        try {
          await fs.unlink(resolvedFile.path);
        } catch {
          // Ignore temp cleanup errors.
        }
      }
      // If imageStorage.store() was never reached (or threw before consuming these), the
      // medium/thumbnail temp files would otherwise leak in TEMP_DIR -- a no-op if store()
      // already claimed/unlinked them itself.
      for (const variantFile of [mediumFile, thumbnailFile]) {
        if (variantFile?.path) {
          try {
            await fs.unlink(variantFile.path);
          } catch {
            // Ignore temp cleanup errors.
          }
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

        let stored;
        try {
          stored = await imageStorage.store({
            itemId: normalizedItemId,
            originalName: file.originalname,
            reportedMime: file.mimetype,
            tempPath: file.path
          });
        } catch (error) {
          throw buildStorefrontImageFailure({
            error,
            code: DomainErrorCode.STOREFRONT_IMAGE_PROCESSING_FAILED,
            reasonCode: 'STOREFRONT_IMAGE_PROCESSING_FAILED',
            message: 'The server could not process this image. Try a different JPG, PNG, or WebP image and save again.',
            itemId: normalizedItemId,
            file,
            user
          });
        }
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
      let data;
      try {
        data = await itemRepository.updateStorefrontCatalogImage(normalizedItemId, {
          path: primary?.path || null,
          url: primary?.url || null,
          gallery
        }, {
          keepVisible: effective?.storefront_visible !== false
        });
      } catch (error) {
        throw buildStorefrontImageFailure({
          error,
          code: DomainErrorCode.STOREFRONT_IMAGE_PERSIST_FAILED,
          reasonCode: 'STOREFRONT_IMAGE_PERSIST_FAILED',
          message: 'The image was processed but could not be saved to the item. Nothing was changed; try Save Item again.',
          itemId: normalizedItemId,
          file: normalizedFiles[0],
          user
        });
      }
      storedCommitted = true;

      const response = toSerializable(data);
      response.storefront_image_variants = primary?.variants || null;
      response.storefront_image_original_path = primary?.original_path || null;
      response.storefront_image_classification = primary?.classification || null;
      await writeCatalogAudit({
        itemRepository,
        user,
        item,
        entityType: 'item_catalog_image',
        eventType: 'item_catalog_images_uploaded',
        action: 'CREATE',
        changes: {
          uploaded_count: storedImages.length,
          image_count: gallery.length,
          original_filenames: normalizedFiles.map((file) => String(file.originalname || '').slice(0, 180))
        }
      });
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
      // Phase 299 (#265): groups the batch by SKU before processing -- see
      // bulkCatalogImageFilename.js's own docs. A bare `<SKU>.<ext>` file behaves identically to
      // today; `<SKU>__large/medium/thumbnail.<ext>` siblings combine into one
      // imageStorage.store() call per SKU.
      const { bySku, duplicateReasonBySku, groupOrder } = groupBulkCatalogFilesBySku(normalizedFiles);
      const skuCodesToLookup = groupOrder.filter((skuKey) => !duplicateReasonBySku.has(skuKey));
      const items = await itemRepository.findItemsBySkuCodes(skuCodesToLookup);
      const itemBySku = new Map((items || []).map((item) => {
        const payload = toSerializable(item);
        return [String(payload?.sku_code || '').trim().toUpperCase(), payload];
      }));
      const summary = createBulkImageSummary();
      const results = [];

      for (const skuKey of groupOrder) {
        const group = bySku.get(skuKey);
        const { large, medium, thumbnail } = group.slots;
        const groupFiles = [...large, ...medium, ...thumbnail];
        const duplicateReason = duplicateReasonBySku.get(skuKey);

        if (duplicateReason) {
          await Promise.all(groupFiles.map((file) => cleanupTempFile(file)));
          summary[duplicateReason] += groupFiles.length;
          for (const file of groupFiles) {
            results.push({
              filename: file.originalname,
              sku_code: group.skuCode || null,
              item_id: null,
              surface: 'storefront',
              status: duplicateReason,
              image_url: null,
              errors: [duplicateReason === 'duplicate_filename'
                ? 'Duplicate SKU filename in upload batch'
                : 'Duplicate image variant for this SKU in upload batch'],
              readiness_snapshot: null
            });
          }
          continue;
        }

        const item = itemBySku.get(skuKey);
        if (!item) {
          await Promise.all(groupFiles.map((file) => cleanupTempFile(file)));
          summary.unmatched += groupFiles.length;
          for (const file of groupFiles) {
            results.push({
              filename: file.originalname,
              sku_code: group.skuCode || null,
              item_id: null,
              surface: 'storefront',
              status: 'unmatched',
              image_url: null,
              errors: ['No item matched this SKU filename'],
              readiness_snapshot: null
            });
          }
          continue;
        }

        const largeFile = large[0] || null;
        if (!largeFile) {
          await Promise.all(groupFiles.map((file) => cleanupTempFile(file)));
          summary.failed += groupFiles.length;
          for (const file of groupFiles) {
            results.push({
              filename: file.originalname,
              sku_code: group.skuCode || null,
              item_id: item.item_id,
              surface: 'storefront',
              status: 'failed',
              image_url: null,
              errors: ['A large/original image is required in the same batch as a medium or thumbnail variant.'],
              readiness_snapshot: null
            });
          }
          continue;
        }

        let stored = null;
        let storedCommitted = false;

        try {
          const fileValidation = await validateImageUploadFile({
            file: largeFile,
            allowedMimeTypes: SAFE_IMAGE_MIME_TYPES,
            maxBytes: BULK_CATALOG_IMAGE_MAX_BYTES
          });
          if (!fileValidation.ok) {
            await Promise.all(groupFiles.map((file) => cleanupTempFile(file)));
            summary.failed += groupFiles.length;
            for (const file of groupFiles) {
              results.push({
                filename: file.originalname,
                sku_code: group.skuCode,
                item_id: item.item_id,
                surface: 'storefront',
                status: 'failed',
                image_url: null,
                errors: ['Only image files are allowed for storefront catalog uploads.'],
                readiness_snapshot: null
              });
            }
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
            await Promise.all(groupFiles.map((file) => cleanupTempFile(file)));
            summary.blocked_readiness += groupFiles.length;
            for (const file of groupFiles) {
              results.push({
                filename: file.originalname,
                sku_code: group.skuCode,
                item_id: item.item_id,
                surface: 'storefront',
                status: 'blocked_readiness',
                image_url: null,
                errors: ['Visible Storefront items need a customer sale price before image upload.'],
                readiness_snapshot: readinessEnvelope?.storefront_readiness || null
              });
            }
            continue;
          }

          const mediumFile = medium[0] || null;
          const thumbnailFile = thumbnail[0] || null;
          // An explicit `__large` suffix is the bulk endpoint's own opt-in signal for the
          // client-already-optimized fast path -- there is no manifest transport in bulk
          // requests, so the filename convention itself carries the signal. A bare filename
          // (today's format) never sets this, preserving exact legacy behavior.
          const acceptedAsClientLarge = parseBulkCatalogFilename(largeFile).variantKey === 'large';

          stored = await imageStorage.store({
            itemId: item.item_id,
            originalName: largeFile.originalname,
            reportedMime: largeFile.mimetype,
            tempPath: largeFile.path,
            acceptedAsClientLarge,
            clientVariantFiles: (mediumFile || thumbnailFile) ? {
              ...(mediumFile ? { medium: { tempPath: mediumFile.path, reportedMime: mediumFile.mimetype } } : {}),
              ...(thumbnailFile ? { thumbnail: { tempPath: thumbnailFile.path, reportedMime: thumbnailFile.mimetype } } : {})
            } : null
          });
          const updated = await itemRepository.updateStorefrontCatalogImage(item.item_id, {
            path: stored.path,
            url: stored.url
          }, {
            keepVisible: effectiveVisible
          });
          storedCommitted = true;

          await writeCatalogAudit({
            itemRepository,
            user,
            item,
            entityType: 'item_catalog_image',
            eventType: 'item_catalog_image_uploaded',
            action: 'CREATE',
            changes: {
              original_filename: String(largeFile.originalname || '').slice(0, 180) || null,
              replaced_existing_image: Boolean(existing?.storefront_image_path),
              bulk_upload: true,
              variant_file_count: groupFiles.length
            }
          });

          if (existing?.storefront_image_path && existing.storefront_image_path !== stored.path) {
            try {
              await imageStorage.remove({ path: existing.storefront_image_path });
            } catch {
              // Best-effort cleanup of replaced image.
            }
          }

          summary.uploaded += 1;
          for (const file of groupFiles) {
            const variantKey = file === largeFile ? 'large' : (file === mediumFile ? 'medium' : 'thumbnail');
            results.push({
              filename: file.originalname,
              sku_code: group.skuCode,
              item_id: item.item_id,
              surface: 'storefront',
              status: 'uploaded',
              variant_key: variantKey,
              image_url: stored.url,
              image_variants: stored.image_variants || null,
              image_original_path: stored.original?.path || null,
              image_classification: stored.classification || null,
              errors: [],
              readiness_snapshot: readinessEnvelope?.storefront_readiness || null,
              data: toSerializable(updated)
            });
          }
        } catch (error) {
          if (stored && !storedCommitted) {
            try {
              await imageStorage.remove({ path: stored.path });
            } catch {
              // Best-effort cleanup.
            }
          }
          await Promise.all(groupFiles.map((file) => cleanupTempFile(file)));
          summary.failed += groupFiles.length;
          for (const file of groupFiles) {
            results.push({
              filename: file.originalname,
              sku_code: group.skuCode || null,
              item_id: item?.item_id || null,
              surface: 'storefront',
              status: 'failed',
              image_url: null,
              errors: [error?.message || 'Failed to upload image'],
              readiness_snapshot: null
            });
          }
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
      await writeCatalogAudit({
        itemRepository,
        user,
        item,
        entityType: 'item_catalog_image',
        eventType: 'item_catalog_images_deleted',
        action: 'DELETE',
        changes: { deleted_count: existingGallery.length }
      });
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

    await writeCatalogAudit({
      itemRepository,
      user,
      item,
      entityType: 'item_catalog_image',
      eventType: 'item_catalog_gallery_updated',
      changes: {
        previous_image_count: existingGallery.length,
        image_count: requestedGallery.length,
        removed_count: removedPaths.length,
        primary_image_changed: (existingGallery[0]?.path || existingGallery[0]?.url || null)
          !== (requestedGallery[0]?.path || requestedGallery[0]?.url || null)
      }
    });

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

    const item = await itemRepository.getItemById(normalizedItemId);
    await writeCatalogAudit({
      itemRepository,
      user,
      item,
      entityType: 'item_catalog_image',
      eventType: 'item_catalog_image_deleted',
      action: 'DELETE',
      changes: {
        image_index: normalizedImageIndex,
        remaining_image_count: nextGallery.length
      }
    });

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
    const item = await itemRepository.getItemById(normalizedItemId);
    await writeCatalogAudit({
      itemRepository,
      user,
      item,
      entityType: 'item_catalog_image',
      eventType: 'item_catalog_images_deleted',
      action: 'DELETE',
      changes: { deleted_count: existingGallery.length || (existing?.storefront_image_path ? 1 : 0) }
    });
    return toSerializable(data);
  };
};

/**
 * Resolves and validates a single item for AI image generation (#197) — the
 * "Generate an Image" action for existing items, reusing the shared
 * generation service built for #176's menu-import review step. Deliberately
 * does NOT enqueue the generation task itself: doing that here would import
 * workers/itemImageWorker.js, which itself imports uploadStorefrontCatalogImageUseCase
 * from this module's index.js — a circular import. Enqueueing happens in the
 * controller layer instead (modules/inventory/controllers/itemHandlers.js),
 * mirroring how menuImportController.js already enqueues directly rather
 * than through a use case.
 *
 * No existing-photo guard here: this action is also how #176's "regenerate a
 * bad AI image" question resolves (see that issue's own punt to this one) —
 * an item with an unwanted photo is, at that point, just an item that needs
 * a new one, so replacing an existing photo on a deliberate single-item
 * request is expected, not a mistake to guard against. Bulk generation
 * (below) is where an accidental mass-overwrite risk actually exists.
 */
export const buildGenerateItemImageUseCase = ({ itemRepository }) => {
  return async ({ itemId, user }) => {
    assertCanEditItems(user, 'generate an image for');
    const normalizedItemId = parsePositiveInt(itemId);
    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'itemId must be a positive integer', { statusCode: 400 });
    }
    if (!requireItemImageGenerationConfig().configured) {
      throw new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        'AI item image generation is not enabled for this environment.',
        { statusCode: 503 }
      );
    }

    const item = await itemRepository.getItemById(normalizedItemId);
    if (!item) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, `Item ${normalizedItemId} was not found`, { statusCode: 404 });
    }
    const plainItem = toSerializable(item);

    return {
      item_id: normalizedItemId,
      name: plainItem.name,
      description: plainItem.description || null,
      category: plainItem.product_folder || null,
      generation_user: buildGenerationUser(user)
    };
  };
};

/**
 * Bulk sibling of buildGenerateItemImageUseCase — the items-list selection
 * bar's "Generate Images" action (#197). Unlike the single-item action,
 * this DOES guard against overwriting an existing photo by default: a bulk
 * selection can easily include items the operator never meant to touch, and
 * silently replacing a manually-uploaded photo would be a bad default (the
 * single-item action's regeneration case is deliberate; a bulk selection
 * usually isn't). `overwriteExisting: true` opts back in per call.
 *
 * Same enqueue-in-the-controller split as the single-item use case above,
 * for the same circular-import reason.
 */
export const buildBulkGenerateItemImageUseCase = ({ itemRepository }) => {
  return async ({ itemIds, overwriteExisting = false, user }) => {
    assertCanEditItems(user, 'generate images for');
    const normalizedIds = normalizeBulkItemIds(itemIds);
    if (!normalizedIds || normalizedIds.length === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'itemIds must be a non-empty array', { statusCode: 400 });
    }
    if (normalizedIds.length > BULK_CATALOG_MAX_ITEM_IDS) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `itemIds cannot exceed ${BULK_CATALOG_MAX_ITEM_IDS} entries`, { statusCode: 400 });
    }
    if (!requireItemImageGenerationConfig().configured) {
      throw new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        'AI item image generation is not enabled for this environment.',
        { statusCode: 503 }
      );
    }

    const candidates = [];
    for (const itemId of normalizedIds) {
      const item = await itemRepository.getItemById(itemId);
      if (!item) {
        candidates.push({ item_id: itemId, status: 'not_found' });
        continue;
      }

      const existing = await itemRepository.findStorefrontCatalogOverrideByItemId(itemId);
      if (existing?.storefront_image_path && !overwriteExisting) {
        candidates.push({ item_id: itemId, status: 'skipped', reason: 'has_existing_photo' });
        continue;
      }

      const plainItem = toSerializable(item);
      candidates.push({
        item_id: itemId,
        status: 'eligible',
        name: plainItem.name,
        description: plainItem.description || null,
        category: plainItem.product_folder || null
      });
    }

    return { generation_user: buildGenerationUser(user), candidates };
  };
};
