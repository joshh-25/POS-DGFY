import fs from 'fs/promises';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  SAFE_IMAGE_MIME_TYPES,
  validateImageUploadFile
} from '../../shared/utils/imageUploadValidation.js';
import logger from '../../../config/logger.js';

const PERMISSION_EDIT_ITEMS = 'items:edit';
const STOREFRONT_CATALOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

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

    const data = await itemRepository.upsertStorefrontCatalogOverride(normalizedItemId, {
      storefront_visible: payload.storefront_visible
    });
    return toSerializable(data);
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
