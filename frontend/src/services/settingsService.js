import api from './api.js';
import { getCompanyToken } from './browserSession.js';

const SETTINGS_CACHE_TTL_MS = 30 * 1000;
let cachedSettings = null;
let cachedSettingsExpiresAt = 0;
let cachedSettingsScope = null;
let inFlightSettingsRequest = null;

const getSettingsScope = () => {
  const companyToken = getCompanyToken() || 'default';
  const authEpoch = localStorage.getItem('authEpoch') || '0';
  return `${companyToken}:${authEpoch}`;
};

const invalidateSettingsCache = () => {
  cachedSettings = null;
  cachedSettingsExpiresAt = 0;
  cachedSettingsScope = null;
  inFlightSettingsRequest = null;
};

/**
 * Get all system settings
 */
export const getAllSettings = async ({ force = false, requestConfig = {} } = {}) => {
  const scope = getSettingsScope();
  const now = Date.now();

  if (!force && cachedSettings && cachedSettingsScope === scope && cachedSettingsExpiresAt > now) {
    return cachedSettings;
  }

  if (!force && inFlightSettingsRequest && cachedSettingsScope === scope) {
    return inFlightSettingsRequest;
  }

  cachedSettingsScope = scope;
  inFlightSettingsRequest = api.get('/settings', requestConfig)
    .then((response) => {
      const settings = response.data.data;
      cachedSettings = settings;
      cachedSettingsExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;
      return settings;
    })
    .finally(() => {
      inFlightSettingsRequest = null;
    });

  return inFlightSettingsRequest;
};

/**
 * Get a single setting by key
 */
export const getSettingByKey = async (key) => {
  const response = await api.get(`/settings/${key}`);
  return response.data.data;
};

/**
 * Update multiple settings at once
 */
export const updateSettings = async (settingsData) => {
  const response = await api.put('/settings', settingsData);
  invalidateSettingsCache();
  return response.data.data;
};

/**
 * Update a single setting by key
 */
export const updateSettingByKey = async (key, value) => {
  const response = await api.put(`/settings/${key}`, { value });
  invalidateSettingsCache();
  return response.data.data;
};

/**
 * Reset all settings to default values (admin only)
 */
export const resetSettingsToDefault = async () => {
  const response = await api.post('/settings/reset');
  invalidateSettingsCache();
  return response.data.data;
};

/**
 * Get company info (Master Admin only)
 * Returns company token and registration link
 */
export const getCompanyInfo = async () => {
  const response = await api.get('/settings/company-info');
  return response.data.data;
};

export const uploadStorefrontAsset = async (assetType, file) => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post(`/settings/storefront-assets/${encodeURIComponent(assetType)}`, formData);
  invalidateSettingsCache();
  return response.data.data;
};

export const deleteStorefrontAsset = async (assetType) => {
  const response = await api.delete(`/settings/storefront-assets/${encodeURIComponent(assetType)}`);
  invalidateSettingsCache();
  return response.data.data;
};

export const verifyPosSettingsAccessPin = async (pin) => {
  const response = await api.post('/settings/verify-pos-access-pin', { pin });
  return response.data.data;
};
