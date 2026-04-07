import dbStore from '../../../utils/dbStore.js';
import {
  getAllSettingsUseCase,
  getSettingByKeyUseCase,
  updateSettingsUseCase,
  updateSettingByKeyUseCase,
  resetSettingsToDefaultUseCase,
  getCompanyInfoUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';
import { syncStorefrontDiscoveryWithReliability } from '../../../services/storefrontDiscoverySyncReliabilityService.js';
import logger from '../../../config/logger.js';
import { invalidateTenantLookupCache } from '../../../middleware/tenantHandler.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const defaultErrorPayload = (req, res, failure) => ({
  success: false,
  data: null,
  message: failure.message,
  error_code: failure.code,
  errors: failure.details,
  request_id: requestId(req, res),
  timestamp: timestamp()
});

const invalidateTenantCache = (req) => {
  invalidateTenantLookupCache({
    companyToken: req.headers['x-company-token'] || null,
    tenantId: req.tenant?.id || null
  });
};

/**
 * @route   GET /api/v1/settings
 * @desc    Get all system settings
 * @access  Private (authenticated users)
 */
export const getAllSettings = async (req, res, next) => {
  try {
    const result = await getAllSettingsUseCase();
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'settings_viewed',
      surface: 'settings',
      action: 'view_all_settings',
      result,
      successMetadataResolver: (data) => ({
        key_count: data ? Object.keys(data).length : 0
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Settings retrieved successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
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
    const result = await getSettingByKeyUseCase({ key: req.params.key });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'setting_viewed',
      surface: 'settings',
      action: 'view_setting',
      result,
      successMetadataResolver: () => ({
        key: req.params.key
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Setting retrieved successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
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
    const result = await updateSettingsUseCase({
      settingsData: req.validatedData,
      actorUser: req.user
    });
    if (result?.success) {
      invalidateTenantCache(req);
    }
    if (result?.ok && req.tenant?.id) {
      syncStorefrontDiscoveryWithReliability({
        tenantId: req.tenant.id,
        source: 'settings_update_bulk',
        requestId: requestId(req, res)
      }).then((syncResult) => {
        if (syncResult?.ok) return;
        logger.warn('[SettingsHandlers] Storefront discovery index remained degraded after updateSettings retries', {
          tenantId: req.tenant?.id || null,
          requestId: requestId(req, res),
          attempts: syncResult?.attempts || 0,
          errors: syncResult?.errors || []
        });
      }).catch((error) => {
        logger.warn('[SettingsHandlers] Storefront discovery reliability runner failed after updateSettings', {
          tenantId: req.tenant?.id || null,
          requestId: requestId(req, res),
          error: error?.message || 'unknown_error'
        });
      });
    }
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'settings_updated',
      surface: 'settings',
      action: 'update_settings',
      result,
      successMetadataResolver: () => ({
        key_count: req.validatedData ? Object.keys(req.validatedData).length : 0
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Settings updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
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
    const result = await updateSettingByKeyUseCase({
      key: req.params.key,
      value: req.validatedData.value,
      actorUser: req.user
    });
    if (result?.success) {
      invalidateTenantCache(req);
    }
    if (result?.ok && req.tenant?.id) {
      syncStorefrontDiscoveryWithReliability({
        tenantId: req.tenant.id,
        source: 'settings_update_single',
        requestId: requestId(req, res)
      }).then((syncResult) => {
        if (syncResult?.ok) return;
        logger.warn('[SettingsHandlers] Storefront discovery index remained degraded after updateSettingByKey retries', {
          tenantId: req.tenant?.id || null,
          settingKey: req.params.key,
          requestId: requestId(req, res),
          attempts: syncResult?.attempts || 0,
          errors: syncResult?.errors || []
        });
      }).catch((error) => {
        logger.warn('[SettingsHandlers] Storefront discovery reliability runner failed after updateSettingByKey', {
          tenantId: req.tenant?.id || null,
          settingKey: req.params.key,
          requestId: requestId(req, res),
          error: error?.message || 'unknown_error'
        });
      });
    }
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Setting updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
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
    const result = await resetSettingsToDefaultUseCase();
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Settings reset to default values',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
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
    if (!req.tenant?.id) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Company token required',
        timestamp: timestamp()
      });
    }

    // Prefer request tenant context from tenantHandler. The async-local store can
    // be "default" when tenant DB connection falls back, but req.tenant still
    // contains the resolved landlord tenant identity.
    const tenantId = req.tenant?.id || dbStore.getStore()?.tenantId;
    const result = await getCompanyInfoUseCase({ tenantId });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Company information retrieved successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        error_code: failure.code,
        errors: failure.details,
        timestamp: timestamp()
      })
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getAllSettings,
  getSettingByKey,
  updateSettings,
  updateSettingByKey,
  resetSettingsToDefault,
  getCompanyInfo
};
