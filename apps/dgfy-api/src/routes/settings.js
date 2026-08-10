import express from 'express';
import * as settingsController from '../controllers/settingsController.js';
import {
  authenticate,
  checkPermission,
  checkStorefrontBrandingEditPermission,
  requireMasterAdmin
} from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { storefrontAssetUpload, preserveTenantContext } from '../config/uploadConfig.js';
import {
  validateVerifyPosSettingsAccessPin,
  validateStorefrontAssetTypeParam,
  validateUpdateSettings,
  validateUpdateSingleSetting
} from '../validators/settingsValidator.js';

const router = express.Router();

/**
 * @route   GET /api/v1/settings
 * @desc    Get all system settings
 * @access  Private (authenticated users)
 */
router.get('/', authenticate, settingsController.getAllSettings);

/**
 * @route   GET /api/v1/settings/company-info
 * @desc    Get company token and registration link
 * @access  Private (Master Admin only)
 */
router.get('/company-info', authenticate, requireMasterAdmin, settingsController.getCompanyInfo);

router.post(
  '/verify-pos-access-pin',
  authenticate,
  validateVerifyPosSettingsAccessPin,
  settingsController.verifyPosSettingsAccessPin
);

router.post(
  '/storefront-slug/generate',
  authenticate,
  checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
  settingsController.generateStorefrontSlug
);

/**
 * @route   GET /api/v1/settings/:key
 * @desc    Get a single setting by key
 * @access  Private (authenticated users)
 */
router.get('/:key', authenticate, settingsController.getSettingByKey);

/**
 * @route   PUT /api/v1/settings
 * @desc    Update multiple settings at once
 * @access  Private (Manager/Admin only)
 */
router.put(
  '/',
  authenticate,
  checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
  validateUpdateSettings,
  settingsController.updateSettings
);

/**
 * @route   PUT /api/v1/settings/:key
 * @desc    Update a single setting by key
 * @access  Private (Manager/Admin only)
 */
router.put(
  '/:key',
  authenticate,
  checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
  validateUpdateSingleSetting,
  settingsController.updateSettingByKey
);

router.post(
  '/storefront-assets/:asset_type',
  authenticate,
  checkStorefrontBrandingEditPermission,
  validateStorefrontAssetTypeParam,
  preserveTenantContext(storefrontAssetUpload.single('image')),
  settingsController.uploadStorefrontAsset
);

router.delete(
  '/storefront-assets/:asset_type',
  authenticate,
  checkStorefrontBrandingEditPermission,
  validateStorefrontAssetTypeParam,
  settingsController.deleteStorefrontAsset
);

/**
 * @route   POST /api/v1/settings/reset
 * @desc    Reset all settings to default values
 * @access  Private (Admin only)
 */
router.post(
  '/reset',
  authenticate,
  checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
  settingsController.resetSettingsToDefault
);

export default router;
