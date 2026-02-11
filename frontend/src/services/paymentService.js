import api from './api.js';

/**
 * Handle Real-time Upgrade to Premium
 * @param {string} subscriptionId - PayPal Subscription ID
 * @returns {Promise<Object>} Updated plan info
 */
export const upgradeToPremium = async (subscriptionId) => {
    const response = await api.post('/payments/upgrade', { subscriptionId });
    return response.data.data;
};
