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
const STOREFRONT_CATALOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
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

    if (payload.storefront_visible === true) {
      assertStorefrontPriceReady(item, normalizedItemId, 'Storefront visibility');
    }

    const data = await itemRepository.upsertStorefrontCatalogOverride(normalizedItemId, {
      storefront_visible: payload.storefront_visible
    });
    return toSerializable(data);
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
        maxBytes: STOREFRONT_CATALOG_IMAGE_MAX_BYTES
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

      return toSerializable(data);
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
            maxBytes: STOREFRONT_CATALOG_IMAGE_MAX_BYTES
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

export const buildDeleteStorefrontCatalogImageUseCase = ({ itemRepository, imageStorage }) => {
  return async ({ itemId, user }) => {
    assertCanEditItems(user, 'delete images for');
    const normalizedItemId = parsePositiveInt(itemId);
    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'itemId must be a positive integer', { statusCode: 400 });
    }

    const existing = await itemRepository.findStorefrontCatalogOverrideByItemId(normalizedItemId);
    if (existing?.storefront_image_path) {
      await imageStorage.remove({ path: existing.storefront_image_path });
    }

    const data = await itemRepository.clearStorefrontCatalogImage(normalizedItemId);
    return toSerializable(data);
  };
};
