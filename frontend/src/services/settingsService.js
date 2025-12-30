import api from './api.js';

/**
 * Get all system settings
 */
export const getAllSettings = async () => {
  const response = await api.get('/settings');
  return response.data.data;
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
  return response.data.data;
};

/**
 * Update a single setting by key
 */
export const updateSettingByKey = async (key, value) => {
  const response = await api.put(`/settings/${key}`, { value });
  return response.data.data;
};

/**
 * Reset all settings to default values (admin only)
 */
export const resetSettingsToDefault = async () => {
  const response = await api.post('/settings/reset');
  return response.data.data;
};
