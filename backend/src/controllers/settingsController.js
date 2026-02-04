import * as settingsService from '../services/settingsService.js';
import { Tenant } from '../models/index.js';
import dbStore from '../utils/dbStore.js';

/**
 * @route   GET /api/v1/settings
 * @desc    Get all system settings
 * @access  Private (authenticated users)
 */
export const getAllSettings = async (req, res, next) => {
  try {
    const settings = await settingsService.getAllSettings();

    res.status(200).json({
      success: true,
      data: settings,
      message: 'Settings retrieved successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/v1/settings/:key
 * @desc    Get a single setting by key
 * @access  Private (authenticated users)
 */
export const getSettingByKey = async (req, res, next) => {
  try {
    const { key } = req.params;
    const setting = await settingsService.getSettingByKey(key);

    res.status(200).json({
      success: true,
      data: setting,
      message: 'Setting retrieved successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      error.statusCode = 404;
    }
    next(error);
  }
};

/**
 * @route   PUT /api/v1/settings
 * @desc    Update multiple settings at once
 * @access  Private (Manager/Admin only)
 */
export const updateSettings = async (req, res, next) => {
  try {
    const settingsData = req.validatedData;
    const result = await settingsService.updateSettings(settingsData);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Settings updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/v1/settings/:key
 * @desc    Update a single setting by key
 * @access  Private (Manager/Admin only)
 */
export const updateSettingByKey = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.validatedData;
    const result = await settingsService.updateSettingByKey(key, value);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Setting updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      error.statusCode = 404;
    }
    next(error);
  }
};

/**
 * @route   POST /api/v1/settings/reset
 * @desc    Reset all settings to default values
 * @access  Private (Admin only)
 */
export const resetSettingsToDefault = async (req, res, next) => {
  try {
    const result = await settingsService.resetSettingsToDefault();

    res.status(200).json({
      success: true,
      data: result,
      message: 'Settings reset to default values',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/v1/settings/company-info
 * @desc    Get company token and registration link (Master Admin only)
 * @access  Private (Master Admin only)
 */
export const getCompanyInfo = async (req, res, next) => {
  try {
    const store = dbStore.getStore();
    const tenantId = store?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'No tenant context found',
        timestamp: new Date().toISOString()
      });
    }

    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Tenant not found',
        timestamp: new Date().toISOString()
      });
    }

    // Build registration link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const registrationLink = `${frontendUrl}/register?token=${tenant.company_token}`;

    res.status(200).json({
      success: true,
      data: {
        company_name: tenant.name,
        company_token: tenant.company_token,
        registration_link: registrationLink
      },
      message: 'Company information retrieved successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};
