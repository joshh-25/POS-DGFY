import express from 'express';
import * as settingsController from '../controllers/settingsController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateUpdateSettings, validateUpdateSingleSetting } from '../validators/settingsValidator.js';

const router = express.Router();

/**
 * @route   GET /api/v1/settings
 * @desc    Get all system settings
 * @access  Private (authenticated users)
 */
router.get('/', authenticate, settingsController.getAllSettings);

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
  authorize('manager', 'admin'),
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
  authorize('manager', 'admin'),
  validateUpdateSingleSetting,
  settingsController.updateSettingByKey
);

/**
 * @route   POST /api/v1/settings/reset
 * @desc    Reset all settings to default values
 * @access  Private (Admin only)
 */
router.post(
  '/reset',
  authenticate,
  authorize('admin'),
  settingsController.resetSettingsToDefault
);

export default router;
