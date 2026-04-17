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
    const data = response.data.data;
    // Embed the target receive URL so the UI can construct the full link correctly
    return {
        ...data,
        url: `/receive/${data.token}`
    };
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
 * Perform the receive operation (PO or JO) via the QR token.
 * Authenticated user session is required; token identifies the target order.
 * @param {string} token - The raw token from the QR URL
 * @param {object} receiptData - For PO: { location_id, line_items, notes, delivery_rating }
 *                               For JO: { quantity_produced, source_location_id, destination_location_id, notes, quality_check }
 */
export const receiveViaToken = async (token, receiptData) => {
    const response = await api.post(`/receive-tokens/${token}/receive`, receiptData);
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
