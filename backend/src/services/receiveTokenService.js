
import crypto from 'crypto';
import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import logger from '../config/logger.js';

// Default token expiry (7 days)
const DEFAULT_TOKEN_EXPIRY_DAYS = 7;

/**
 * Generate a secure random token
 * @returns {string} A 32-character hex token
 */
const generateSecureToken = () => {
    return crypto.randomBytes(16).toString('hex');
};

/**
 * Hash a token for storage
 * @param {string} token - The raw token
 * @returns {string} SHA-256 hash of the token
 */
const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate a receive token for an order
 * @param {string} orderType - 'PO' or 'JO'
 * @param {number} orderId - The order ID
 * @param {number} userId - User creating the token
 * @param {number} expiryDays - Days until token expires (default 7)
 * @returns {object} Token info including the raw token (only returned once)
 */
export const generateToken = async (orderType, orderId, userId, expiryDays = DEFAULT_TOKEN_EXPIRY_DAYS) => {
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    const JobOrder = dbStore.get('JobOrder');
    const ReceiveToken = dbStore.get('ReceiveToken');

    // Validate order type
    if (!['PO', 'JO'].includes(orderType)) {
        const error = new Error('Invalid order type. Must be PO or JO');
        error.statusCode = 400;
        throw error;
    }

    // Validate the order exists and is in receivable state
    if (orderType === 'PO') {
        const po = await PurchaseOrder.findByPk(orderId);

        if (!po) {
            const error = new Error('Purchase order not found');
            error.statusCode = 404;
            throw error;
        }
        if (!['pending', 'partial'].includes(po.status)) {
            const error = new Error(`Cannot generate token for PO with status "${po.status}". Must be pending or partial.`);
            error.statusCode = 400;
            throw error;
        }
    } else {
        const jo = await JobOrder.findByPk(orderId);
        if (!jo) {
            const error = new Error('Job order not found');
            error.statusCode = 404;
            throw error;
        }
        if (!['in_progress', 'partial'].includes(jo.status)) {
            const error = new Error(`Cannot generate token for JO with status "${jo.status}". Must be in_progress or partial.`);
            error.statusCode = 400;
            throw error;
        }
    }

    // Check for existing active token
    const existingToken = await ReceiveToken.findOne({
        where: {
            token_type: orderType,
            order_id: orderId,
            expires_at: { [Op.gt]: new Date() },
            used_at: null
        }
    });

    if (existingToken) {
        // Return existing token info (without raw token as we can't recover it)
        // Ideally, we should generate a new one or allow re-fetching if we stored it (we store hash)
        // For security, let's invalidate old and create new
        await existingToken.update({ expires_at: new Date() }); // Expire immediately
    }

    // Create new token
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    await ReceiveToken.create({
        token_hash: tokenHash,
        token_type: orderType,
        order_id: orderId,
        created_by: userId,
        expires_at: expiresAt
    });

    return {
        token: rawToken,
        expires_at: expiresAt
    };
};

/**
 * Validate a receive token
 * @param {string} token - The raw token
 * @returns {object} The token record and associated order
 */
export const validateToken = async (token) => {
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    const JobOrder = dbStore.get('JobOrder');
    const ReceiveToken = dbStore.get('ReceiveToken');

    const tokenHash = hashToken(token);

    const receiveToken = await ReceiveToken.findOne({
        where: {
            token_hash: tokenHash,
            expires_at: { [Op.gt]: new Date() },
            used_at: null
        }
    });

    if (!receiveToken) {
        const error = new Error('Invalid or expired token');
        error.statusCode = 404; // Or 401
        throw error;
    }

    // Fetch order details to ensure it's still valid
    let order;
    if (receiveToken.token_type === 'PO') {
        order = await PurchaseOrder.findByPk(receiveToken.order_id);
    } else {
        order = await JobOrder.findByPk(receiveToken.order_id);
    }

    if (!order) {
        const error = new Error('Associated order not found');
        error.statusCode = 404;
        throw error;
    }

    return {
        receiveToken,
        order
    };
};

/**
 * Mark a token as used
 * @param {string} token - The raw token
 * @param {number} userId - User who used it
 */
export const markTokenUsed = async (token, userId) => {
    const ReceiveToken = dbStore.get('ReceiveToken');
    const tokenHash = hashToken(token);

    const receiveToken = await ReceiveToken.findOne({
        where: { token_hash: tokenHash }
    });

    if (receiveToken) {
        await receiveToken.update({
            used_at: new Date(),
            used_by: userId
        });
    }
};

/**
 * Get details for a PO via token (public access wrapper)
 * @param {string} token 
 */
export const getPurchaseOrderDetails = async (token) => {
    const { receiveToken, order } = await validateToken(token);

    if (receiveToken.token_type !== 'PO') {
        throw new Error('Token is not for a Purchase Order');
    }

    // You might want to format/limit what data is returned here
    return order;
};

/**
 * Get details for a JO via token (public access wrapper)
 * @param {string} token 
 */
export const getJobOrderDetails = async (token) => {
    const { receiveToken, order } = await validateToken(token);

    if (receiveToken.token_type !== 'JO') {
        throw new Error('Token is not for a Job Order');
    }

    return order;
};
