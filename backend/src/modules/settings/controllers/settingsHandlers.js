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
    const result = await updateSettingsUseCase({ settingsData: req.validatedData });
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
      value: req.validatedData.value
    });
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
    const tenantId = dbStore.getStore()?.tenantId;
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
