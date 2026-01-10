import api from './api';

/**
 * Generate a receive token for QR code
 * @param {string} orderType - 'PO' or 'JO'
 * @param {number} orderId - The order ID
 * @param {number} expiryDays - Days until expiry (optional, default 7)
 */
export const generateReceiveToken = async (orderType, orderId, expiryDays = 7) => {
    const response = await api.post('/receive-tokens', {
        order_type: orderType,
        order_id: orderId,
        expiry_days: expiryDays
    });
    return response.data.data;
};

/**
 * Validate a receive token and get order details
 * @param {string} token - The raw token from QR code
 */
export const validateReceiveToken = async (token) => {
    const response = await api.get(`/receive-tokens/${token}`);
    return response.data.data;
};

/**
 * Mark a token as used
 * @param {number} tokenId - The token ID
 */
export const markTokenUsed = async (tokenId) => {
    const response = await api.post(`/receive-tokens/${tokenId}/use`);
    return response.data.data;
};

export default {
    generateReceiveToken,
    validateReceiveToken,
    markTokenUsed
};
