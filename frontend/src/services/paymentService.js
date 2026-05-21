import api from './api.js';

const PAYMENTS_DISABLED_MESSAGE = 'Payments are temporarily disabled while the billing direction is being updated.';

const assertPaymentsEnabled = () => {
    if (import.meta.env.VITE_PAYMENTS_ENABLED === 'true') return;
    const error = new Error(PAYMENTS_DISABLED_MESSAGE);
    error.response = {
        status: 503,
        data: {
            success: false,
            code: 'PAYMENTS_DISABLED',
            message: PAYMENTS_DISABLED_MESSAGE
        }
    };
    throw error;
};

/**
 * Handle Real-time Upgrade to Premium
 * @param {string} subscriptionId - PayPal Subscription ID (DISABLED - switching to PayMongo)
 * @returns {Promise<Object>} Updated plan info
 */
/*
export const upgradeToPremium = async (subscriptionId) => {
    const response = await api.post('/payments/upgrade', { subscriptionId });
    return response.data.data;
};
*/

export const getBillingHistory = async () => {
    assertPaymentsEnabled();
    const response = await api.get('/payments/history');
    return response.data.data;
};

export const cancelSubscription = async () => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/cancel');
    return response.data.data;
};

export const syncSubscription = async () => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/sync');
    return response.data.data;
};

export const syncPayMongoSubscription = async () => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/sync-paymongo');
    return response.data.data;
};

// DISABLED - switching to PayMongo
/*
export const migrateToPayPal = async (subscriptionId) => {
    const response = await api.post('/payments/migrate-to-paypal', { subscriptionId });
    return response.data.data;
};
*/

export const changePlan = async (newPlan) => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/change-plan', { newPlan });
    return response.data.data;
};

export const getPendingPlan = async () => {
    assertPaymentsEnabled();
    const response = await api.get('/payments/pending-plan');
    return response.data.data;
};

export const requestReactivation = async () => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/request-reactivation');
    return response.data.data;
};

export const migrateToPayMongo = async (subscriptionId) => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/migrate-to-paymongo', { subscriptionId });
    return response.data.data;
};

export const reactivateWithPayMongo = async (subscriptionId, companyToken) => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/reactivate-with-paymongo', { subscriptionId }, {
        headers: { 'x-company-token': companyToken }
    });
    return response.data.data;
};

export const setupPayMongoRecurring = async () => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/setup-paymongo-recurring');
    return response.data.data;
};

export const changePayMongoPlan = async (newPlan, effectiveDate) => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/change-paymongo-plan', { newPlan, effectiveDate });
    return response.data.data;
};

export const cancelPayMongoSubscription = async (reason) => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/cancel-paymongo', { reason });
    return response.data.data;
};

// DISABLED - switching to PayMongo
/*
export const reactivateWithPayPal = async (subscriptionId, companyToken) => {
    const response = await api.post('/payments/reactivate-with-paypal', { subscriptionId }, {
        headers: { 'x-company-token': companyToken }
    });
    return response.data.data;
};
*/

export const requestReactivationPublic = async (companyToken) => {
    assertPaymentsEnabled();
    const response = await api.post('/payments/request-reactivation', {}, {
        headers: { 'x-company-token': companyToken }
    });
    return response.data.data;
};
