import {
  getAllSettingsUseCase,
  getSettingByKeyUseCase,
  updateSettingsUseCase,
  updateSettingByKeyUseCase,
  resetSettingsToDefaultUseCase,
  applyThresholdSettingsUseCase
} from '../modules/settings/index.js';
import { unwrapApplicationResultOrThrow } from '../modules/shared/contracts/applicationResultHelpers.js';

/**
 * Settings Service (Compatibility Facade)
 *
 * Legacy callers continue importing this service while behavior is sourced
 * from modular settings use-cases.
 */
export const getAllSettings = async () => {
  const result = await getAllSettingsUseCase();
  return unwrapApplicationResultOrThrow(result, 'Failed to retrieve settings');
};

export const getSettingByKey = async (key) => {
  const result = await getSettingByKeyUseCase({ key });
  return unwrapApplicationResultOrThrow(result, 'Failed to retrieve setting');
};

export const applyThresholdSettings = async () => {
  return applyThresholdSettingsUseCase();
};

export const updateSettings = async (settingsData) => {
  const result = await updateSettingsUseCase({ settingsData });
  return unwrapApplicationResultOrThrow(result, 'Failed to update settings');
};

export const updateSettingByKey = async (key, value) => {
  const result = await updateSettingByKeyUseCase({ key, value });
  return unwrapApplicationResultOrThrow(result, 'Failed to update setting');
};

export const resetSettingsToDefault = async () => {
  const result = await resetSettingsToDefaultUseCase();
  return unwrapApplicationResultOrThrow(result, 'Failed to reset settings');
};
