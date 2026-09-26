import api from './api.js';
import { getCompanyToken } from './browserSession.js';

const SETTINGS_CACHE_TTL_MS = 30 * 1000;
let cachedSettings = null;
let cachedSettingsExpiresAt = 0;
let cachedSettingsScope = null;
let inFlightSettingsRequest = null;
let inFlightSettingsScope = null;

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
  inFlightSettingsScope = null;
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

  if (!force && inFlightSettingsRequest && inFlightSettingsScope === scope) {
    return inFlightSettingsRequest;
  }

  const requestScope = scope;
  inFlightSettingsScope = requestScope;
  const settingsRequest = api.get('/settings', requestConfig)
    .then((response) => {
      const settings = response.data.data;
      if (getSettingsScope() === requestScope) {
        cachedSettings = settings;
        cachedSettingsScope = requestScope;
        cachedSettingsExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;
      }
      return settings;
    })
    .finally(() => {
      if (inFlightSettingsRequest === settingsRequest) {
        inFlightSettingsRequest = null;
        inFlightSettingsScope = null;
      }
    });

  inFlightSettingsRequest = settingsRequest;
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
export const updateSettings = async (settingsData, { expectedUpdatedAt = null } = {}) => {
  const hasExpectedVersions = expectedUpdatedAt
    && typeof expectedUpdatedAt === 'object'
    && !Array.isArray(expectedUpdatedAt)
    && Object.keys(expectedUpdatedAt).length > 0;
  const requestPayload = hasExpectedVersions
    ? { ...settingsData, expected_updated_at: expectedUpdatedAt }
    : settingsData;
  const response = await api.put('/settings', requestPayload);
  invalidateSettingsCache();
  return response.data.data;
};

/**
 * Update a single setting by key
 */
export const updateSettingByKey = async (key, value, { expectedUpdatedAt = null } = {}) => {
  const requestPayload = expectedUpdatedAt
    ? { value, expected_updated_at: expectedUpdatedAt }
    : { value };
  const response = await api.put(`/settings/${key}`, requestPayload);
  invalidateSettingsCache();
  return response.data.data;
};

/**
 * List all configurable POS discount rules for the authenticated tenant.
 * This endpoint intentionally has its own service methods instead of using
 * the generic settings cache because discount rules have independent
 * configuration versions and approval state.
 */
export const getDiscountRules = async () => {
  const response = await api.get('/settings/discount-rules');
  return Array.isArray(response.data?.data?.discount_rules)
    ? response.data.data.discount_rules
    : [];
};

export const createDiscountRule = async (payload) => {
  const response = await api.post('/settings/discount-rules', payload);
  return response.data?.data?.discount_rule || null;
};

export const updateDiscountRule = async (discountRuleId, payload) => {
  const response = await api.patch(
    `/settings/discount-rules/${encodeURIComponent(discountRuleId)}`,
    payload
  );
  return response.data?.data?.discount_rule || null;
};

export const deleteDiscountRule = async (discountRuleId) => {
  const response = await api.delete(
    `/settings/discount-rules/${encodeURIComponent(discountRuleId)}`
  );
  return response.data?.data || null;
};

export const generateStorefrontSlug = async () => {
  const response = await api.post('/settings/storefront-slug/generate');
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

export const uploadStorefrontAsset = async (assetType, file, { onUploadProgress } = {}) => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post(
    `/settings/storefront-assets/${encodeURIComponent(assetType)}`,
    formData,
    { onUploadProgress }
  );
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
