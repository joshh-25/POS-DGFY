import crypto from 'crypto';
import { Op } from 'sequelize';
import ReceiveToken from '../models/ReceiveToken.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import JobOrder from '../models/JobOrder.js';
import POLineItem from '../models/POLineItem.js';
import JOIngredient from '../models/JOIngredient.js';
import Item from '../models/Item.js';
import Supplier from '../models/Supplier.js';
import User from '../models/User.js';

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

    // Generate token
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    // Invalidate any existing tokens for this order (optional: allow multiple)
    await ReceiveToken.update(
        { expires_at: new Date() }, // Expire immediately
        {
            where: {
                token_type: orderType,
                order_id: orderId,
                used_at: null,
                expires_at: { [Op.gt]: new Date() }
            }
        }
    );

    // Create new token
    const token = await ReceiveToken.create({
        token_hash: tokenHash,
        token_type: orderType,
        order_id: orderId,
        expires_at: expiresAt,
        created_by: userId
    });

    // Return token info (raw token only returned here, never stored)
    return {
        token_id: token.token_id,
        raw_token: rawToken, // This is what goes in the QR code
        token_type: orderType,
        order_id: orderId,
        expires_at: expiresAt,
        url: `/receive/${rawToken}` // Frontend route
    };
};

/**
 * Validate a token and return order details
 * @param {string} rawToken - The raw token from QR code
 * @returns {object} Order details if token is valid
 */
export const validateToken = async (rawToken) => {
    const tokenHash = hashToken(rawToken);

    const token = await ReceiveToken.findOne({
        where: {
            token_hash: tokenHash
        },
        include: [
            { model: User, as: 'creator', attributes: ['username'] }
        ]
    });

    if (!token) {
        const error = new Error('Invalid token');
        error.statusCode = 404;
        throw error;
    }

    // Check if token is expired
    if (new Date() > token.expires_at) {
        const error = new Error('Token has expired');
        error.statusCode = 410; // Gone
        throw error;
    }

    // Check if token was already used (for single-use tokens)
    if (token.used_at) {
        const error = new Error('Token has already been used');
        error.statusCode = 410;
        throw error;
    }

    // Get order details based on type
    let orderDetails;
    if (token.token_type === 'PO') {
        orderDetails = await getPurchaseOrderDetails(token.order_id);
    } else {
        orderDetails = await getJobOrderDetails(token.order_id);
    }

    return {
        token_id: token.token_id,
        token_type: token.token_type,
        expires_at: token.expires_at,
        created_by: token.creator?.username,
        order: orderDetails
    };
};

/**
 * Mark a token as used
 * @param {number} tokenId - The token ID
 * @param {number} userId - User who used the token
 */
export const markTokenUsed = async (tokenId, userId) => {
    const token = await ReceiveToken.findByPk(tokenId);
    if (!token) {
        const error = new Error('Token not found');
        error.statusCode = 404;
        throw error;
    }

    await token.update({
        used_at: new Date(),
        used_by: userId
    });

    return token;
};

/**
 * Get PO details for mobile receive page
 */
const getPurchaseOrderDetails = async (poId) => {
    const po = await PurchaseOrder.findByPk(poId, {
        include: [
            { model: Supplier, as: 'supplier', attributes: ['name'] },
            { model: User, as: 'creator', attributes: ['username'] },
            {
                model: POLineItem,
                as: 'lineItems',
                include: [{
                    model: Item,
                    as: 'item',
                    attributes: ['item_id', 'sku_code', 'name', 'unit_of_measure', 'fifo_enabled', 'shelf_life_days']
                }]
            }
        ]
    });

    if (!po) {
        const error = new Error('Purchase order not found');
        error.statusCode = 404;
        throw error;
    }

    // Check if PO is still receivable
    if (!['pending', 'partial'].includes(po.status)) {
        const error = new Error(`This PO is ${po.status} and cannot receive more items`);
        error.statusCode = 400;
        throw error;
    }

    // Format line items with remaining quantities
    const items = po.lineItems.map(line => ({
        line_item_id: line.line_item_id,
        item_id: line.item?.item_id,
        sku_code: line.item?.sku_code,
        item_name: line.item?.name,
        unit_of_measure: line.item?.unit_of_measure,
        fifo_enabled: line.item?.fifo_enabled,
        shelf_life_days: line.item?.shelf_life_days,
        quantity_ordered: parseFloat(line.quantity_ordered),
        quantity_received: parseFloat(line.quantity_received || 0),
        quantity_remaining: parseFloat(line.quantity_ordered) - parseFloat(line.quantity_received || 0),
        unit_price: parseFloat(line.unit_price)
    }));

    return {
        order_type: 'PO',
        order_id: po.po_id,
        order_number: po.po_number,
        supplier_name: po.supplier?.name,
        order_date: po.order_date,
        status: po.status,
        created_by: po.creator?.username,
        items,
        total_items: items.length,
        total_remaining: items.reduce((sum, i) => sum + i.quantity_remaining, 0)
    };
};

/**
 * Get JO details for mobile complete page
 */
const getJobOrderDetails = async (joId) => {
    const jo = await JobOrder.findByPk(joId, {
        include: [
            { model: Item, as: 'product', attributes: ['item_id', 'sku_code', 'name', 'unit_of_measure'] },
            { model: User, as: 'responsibleUser', attributes: ['username'] },
            {
                model: JOIngredient,
                as: 'ingredients',
                include: [{
                    model: Item,
                    as: 'item',
                    attributes: ['item_id', 'sku_code', 'name', 'unit_of_measure', 'current_stock']
                }]
            }
        ]
    });

    if (!jo) {
        const error = new Error('Job order not found');
        error.statusCode = 404;
        throw error;
    }

    // Check if JO is completable
    if (!['in_progress', 'partial'].includes(jo.status)) {
        const error = new Error(`This JO is ${jo.status} and cannot be completed`);
        error.statusCode = 400;
        throw error;
    }

    // Format ingredients
    const ingredients = jo.ingredients.map(ing => ({
        item_id: ing.item?.item_id,
        sku_code: ing.item?.sku_code,
        item_name: ing.item?.name,
        unit_of_measure: ing.item?.unit_of_measure,
        quantity_required: parseFloat(ing.quantity_required),
        current_stock: parseFloat(ing.item?.current_stock || 0),
        sufficient: parseFloat(ing.item?.current_stock || 0) >= parseFloat(ing.quantity_required)
    }));

    return {
        order_type: 'JO',
        order_id: jo.jo_id,
        order_number: jo.jo_number,
        product_name: jo.product?.name,
        product_sku: jo.product?.sku_code,
        quantity_to_produce: parseFloat(jo.quantity_to_produce),
        status: jo.status,
        responsible_user: jo.responsibleUser?.username,
        ingredients,
        all_ingredients_sufficient: ingredients.every(i => i.sufficient)
    };
};

/**
 * Get token by ID
 */
export const getTokenById = async (tokenId) => {
    const token = await ReceiveToken.findByPk(tokenId, {
        include: [
            { model: User, as: 'creator', attributes: ['username'] },
            { model: User, as: 'usedByUser', attributes: ['username'] }
        ]
    });

    if (!token) {
        const error = new Error('Token not found');
        error.statusCode = 404;
        throw error;
    }

    return token;
};
