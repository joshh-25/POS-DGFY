import fs from 'fs/promises';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';
import logger from '../../../config/logger.js';
import {
    SAFE_IMAGE_MIME_TYPES,
    validateImageUploadFile
} from '../../shared/utils/imageUploadValidation.js';

const STOREFRONT_ASSET_TYPES = Object.freeze(['cover', 'profile', 'gallery']);
const PERSISTED_STOREFRONT_ASSET_TYPES = Object.freeze(['cover', 'profile']);
const STORE_ASSET_TYPE_TO_SETTING_KEYS = Object.freeze({
    cover: {
        url: 'storefront_cover_image_url',
        path: 'storefront_cover_image_path'
    },
    profile: {
        url: 'storefront_profile_image_url',
        path: 'storefront_profile_image_path'
    }
});
const STOREFRONT_ASSET_MAX_BYTES = 10 * 1024 * 1024;

const normalizeAssetType = (assetType) => String(assetType || '').trim().toLowerCase();
const getAssetKeys = (assetType) => STORE_ASSET_TYPE_TO_SETTING_KEYS[normalizeAssetType(assetType)] || null;
const isSupportedAssetType = (assetType) => STOREFRONT_ASSET_TYPES.includes(normalizeAssetType(assetType));
const getImageValidationMessage = (validation = {}) => {
    switch (validation.reason) {
        case 'file_too_large':
                return 'Storefront images must be 10 MB or smaller.';
        case 'unsupported_reported_mime':
            return 'Only PNG, JPEG, GIF, WebP, BMP, or AVIF images are allowed for storefront assets.';
        case 'unsupported_file_signature':
        case 'mime_signature_mismatch':
            return 'The uploaded file does not match a supported image format.';
        case 'missing_file_path':
            return 'image file is required';
        default:
            return 'Only image files are allowed for storefront assets.';
    }
};

export const buildUploadStorefrontAssetUseCase = ({
    settingsRepository,
    storefrontAssetStorage,
    imageFileValidator = validateImageUploadFile
}) => {
    return async ({ assetType, file }) => {
        const normalizedAssetType = normalizeAssetType(assetType);
        const assetKeys = getAssetKeys(normalizedAssetType);
        if (!isSupportedAssetType(normalizedAssetType)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `asset_type must be one of: ${STOREFRONT_ASSET_TYPES.join(', ')}`,
                { statusCode: 422 }
            ));
        }
        if (!file) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'image file is required',
                { statusCode: 400 }
            ));
        }

        try {
            const fileValidation = await imageFileValidator({
                file,
                allowedMimeTypes: SAFE_IMAGE_MIME_TYPES,
                maxBytes: STOREFRONT_ASSET_MAX_BYTES
            });
            if (!fileValidation.ok) {
                logger.warn('[SettingsStorefrontAsset] Rejected upload due to image validation failure', {
                    event_type: 'security_signal',
                    signal_code: 'storefront_asset_upload_rejected',
                    reason: fileValidation.reason,
                    reported_mime: String(file?.mimetype || '').trim().toLowerCase() || null,
                    original_name: String(file?.originalname || '').slice(0, 180) || null
                });
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    getImageValidationMessage(fileValidation),
                    { statusCode: 422 }
                );
            }

            const stored = await storefrontAssetStorage.store({
                assetType: normalizedAssetType,
                originalName: file.originalname,
                reportedMime: file.mimetype,
                tempPath: file.path
            });

            if (assetKeys) {
                const existing = await settingsRepository.getSettingsByKeys([assetKeys.path, assetKeys.url]);
                const existingPath = String(existing?.[assetKeys.path]?.value || '').trim();

                try {
                    await settingsRepository.updateSettings({
                        [assetKeys.path]: stored.path,
                        [assetKeys.url]: stored.url
                    });
                } catch (error) {
                    await storefrontAssetStorage.remove({ path: stored.path });
                    throw error;
                }

                if (existingPath) {
                    try {
                        await storefrontAssetStorage.remove({ path: existingPath });
                    } catch {
                        // best-effort cleanup of superseded asset
                    }
                }
            }

            return ok({
                asset_type: normalizedAssetType,
                image_url: stored.url,
                path: stored.path,
                image_variants: stored.image_variants || null,
                original_path: stored.original?.path || null,
                image_classification: stored.classification || null
            });
        } catch (error) {
            if (file?.path) {
                try {
                    await fs.unlink(file.path);
                } catch {
                    // best-effort cleanup for rejected temp uploads
                }
            }
            return fail(mapSettingsUseCaseError(error, 'Failed to upload storefront asset'));
        }
    };
};

export const buildDeleteStorefrontAssetUseCase = ({ settingsRepository, storefrontAssetStorage }) => {
    return async ({ assetType }) => {
        const normalizedAssetType = normalizeAssetType(assetType);
        const assetKeys = getAssetKeys(normalizedAssetType);
        if (!PERSISTED_STOREFRONT_ASSET_TYPES.includes(normalizedAssetType) || !assetKeys) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `asset_type must be one of: ${PERSISTED_STOREFRONT_ASSET_TYPES.join(', ')}`,
                { statusCode: 422 }
            ));
        }

        try {
            const existing = await settingsRepository.getSettingsByKeys([assetKeys.path, assetKeys.url]);
            const existingPath = String(existing?.[assetKeys.path]?.value || '').trim();
            if (existingPath) {
                await storefrontAssetStorage.remove({ path: existingPath });
            }

            await settingsRepository.updateSettings({
                [assetKeys.path]: '',
                [assetKeys.url]: ''
            });

            return ok({
                asset_type: normalizedAssetType,
                deleted: true
            });
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to remove storefront asset'));
        }
    };
};
