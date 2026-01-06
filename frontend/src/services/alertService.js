import api from './api.js';

/**
 * Fetch all alerts from the backend
 * @returns {Promise<Array>} Array of alert objects
 */
export const getAlerts = async () => {
  const response = await api.get('/alerts');
  return response.data.data;
};

/**
 * Fetch only expiry-related alerts
 * @returns {Promise<Array>} Array of expiring batch alert objects
 */
export const getExpiryAlerts = async () => {
  const alerts = await getAlerts();
  return alerts.filter(alert => alert.type === 'expiring_batch');
};
