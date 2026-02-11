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

export const getBillingHistory = async () => {
    const response = await api.get('/payments/history');
    return response.data.data;
};

export const cancelSubscription = async () => {
    const response = await api.post('/payments/cancel');
    return response.data.data;
};

export const syncSubscription = async () => {
    const response = await api.post('/payments/sync');
    return response.data.data;
};
