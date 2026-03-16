
import crypto from 'crypto';
import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import logger from '../config/logger.js';
import * as purchaseOrderService from './purchaseOrderService.js';
import * as jobOrderService from './jobOrderService.js';

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
    const orderId = receiveToken.order_id;

    if (receiveToken.token_type === 'PO') {
        const fullPO = await PurchaseOrder.findByPk(orderId, {
            include: [
                { model: dbStore.get('Supplier'), as: 'supplier' },
                {
                    model: dbStore.get('POLineItem'),
                    as: 'lineItems',
                    include: [{ model: dbStore.get('Item'), as: 'item' }]
                }
            ]
        });

        if (fullPO) {
            const safeNum = (val) => {
                const p = parseFloat(val);
                return isNaN(p) ? 0 : p;
            };

            const poData = fullPO.toJSON();
            // NEW: Explicit construction to prevent spread issues
            order = {
                order_type: 'PO',
                order_id: poData.po_id,
                order_number: poData.po_number,
                supplier_name: poData.supplier?.name,
                status: poData.status,
                total_items: (poData.lineItems || []).length,
                total_remaining: (poData.lineItems || []).reduce((sum, li) => {
                    const ordered = safeNum(li.quantity_ordered);
                    const received = safeNum(li.quantity_received);
                    return sum + Math.max(0, ordered - received);
                }, 0),
                items: (poData.lineItems || []).map(li => {
                    const ordered = safeNum(li.quantity_ordered);
                    const received = safeNum(li.quantity_received);
                    return {
                        line_item_id: li.line_item_id,
                        item_name: li.item?.name,
                        sku_code: li.item?.sku_code,
                        quantity_ordered: ordered,
                        quantity_received_total: received,
                        quantity_remaining: Math.max(0, ordered - received),
                        unit_of_measure: li.item?.unit_of_measure
                    };
                })
            };
        }
    } else {
        const fullJO = await JobOrder.findByPk(orderId, {
            include: [
                { model: dbStore.get('Item'), as: 'product' },
                {
                    model: dbStore.get('JOIngredient'),
                    as: 'ingredients',
                    include: [{ model: dbStore.get('Item'), as: 'item' }]
                }
            ]
        });


        if (fullJO) {
            const joData = fullJO.toJSON();
            // NEW: Explicit construction to prevent spread issues
            order = {
                order_type: 'JO',
                order_id: joData.jo_id,
                order_number: joData.jo_number,
                product_name: joData.product?.name,
                status: joData.status,
                quantity_to_produce: parseFloat(joData.quantity_to_produce) || 0,
                quantity_produced: parseFloat(joData.quantity_produced) || 0,
                ingredients: (joData.ingredients || []).map(ing => ({
                    item_id: ing.item_id,
                    item_name: ing.item?.name,
                    quantity_required: parseFloat(ing.quantity_required) || 0,
                    unit_of_measure: ing.item?.unit_of_measure || 'units'
                })),
                items: []
            };
        }
    }

    if (!order) {
        const error = new Error('Associated order not found');
        error.statusCode = 404;
        throw error;
    }

    const tokenJson = receiveToken.toJSON();
    return {
        receiveToken: {
            token_id: tokenJson.id,
            token_type: tokenJson.token_type,
            expires_at: tokenJson.expires_at
        },
        order
    };
};

/**
 * Mark a token as used
 * @param {number} tokenId - The token ID
 * @param {number} userId - User who used it (optional for anonymous scan)
 */
export const markTokenUsed = async (tokenId, userId = null) => {
    const ReceiveToken = dbStore.get('ReceiveToken');

    const receiveToken = await ReceiveToken.findByPk(tokenId);

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

/**
 * Perform the receive operation (PO or JO) via a QR token.
 * The token acts as the authorization credential — no user JWT required.
 * Marks the token as used upon success.
 *
 * @param {string} rawToken - The raw token from the QR code URL
 * @param {object} receiptData - For PO: { line_items, notes, delivery_rating }
 *                               For JO: { quantity_produced, notes, quality_check }
 */
export const receiveViaToken = async (rawToken, receiptData) => {
    const ReceiveToken = dbStore.get('ReceiveToken');

    const tokenHash = hashToken(rawToken);
    const receiveToken = await ReceiveToken.findOne({
        where: {
            token_hash: tokenHash,
            expires_at: { [Op.gt]: new Date() },
            used_at: null
        }
    });

    if (!receiveToken) {
        const error = new Error('Invalid or expired token');
        error.statusCode = 401;
        throw error;
    }

    const orderId = receiveToken.order_id;
    let result;

    if (receiveToken.token_type === 'PO') {
        result = await purchaseOrderService.receivePurchaseOrder(orderId, receiptData, null);
    } else if (receiveToken.token_type === 'JO') {
        const { quantity_produced, notes, quality_check } = receiptData;
        result = await jobOrderService.completeJobOrder(orderId, null, null, notes, quantity_produced, quality_check);
    } else {
        const error = new Error('Unknown token type');
        error.statusCode = 400;
        throw error;
    }

    // Mark token as used ONLY if the order is fully received/completed
    const isCompleted = (receiveToken.token_type === 'PO' && (result.status === 'received' || result.status === 'completed')) ||
                        (receiveToken.token_type === 'JO' && result.status === 'completed');

    if (isCompleted) {
        await receiveToken.update({ used_at: new Date(), used_by: null });
        console.log(`[ReceiveToken] Token ${rawToken.substring(0, 8)}... marked as used (Order ${receiveToken.token_type} #${orderId} is ${result.status})`);
    } else {
        console.log(`[ReceiveToken] Token ${rawToken.substring(0, 8)}... kept ACTIVE (Order ${receiveToken.token_type} #${orderId} is ${result.status})`);
    }

    return result;
};
