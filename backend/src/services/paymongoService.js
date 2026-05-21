import axios from 'axios';
import dotenv from 'dotenv';
import logger from '../config/logger.js';
import crypto from 'crypto';

dotenv.config();

const {
    PAYMONGO_PUBLIC_KEY,
    PAYMONGO_SECRET_KEY,
    PAYMONGO_MODE,
    PAYMONGO_WEBHOOK_SECRET,
    PAYMONGO_TEST_PUBLIC_KEY,
    PAYMONGO_TEST_SECRET_KEY,
    PAYMONGO_LIVE_PUBLIC_KEY,
    PAYMONGO_LIVE_SECRET_KEY
} = process.env;

const RESOLVED_PUBLIC_KEY = PAYMONGO_MODE === 'live'
    ? (PAYMONGO_LIVE_PUBLIC_KEY || PAYMONGO_PUBLIC_KEY)
    : (PAYMONGO_TEST_PUBLIC_KEY || PAYMONGO_PUBLIC_KEY);

const RESOLVED_SECRET_KEY = PAYMONGO_MODE === 'live'
    ? (PAYMONGO_LIVE_SECRET_KEY || PAYMONGO_SECRET_KEY)
    : (PAYMONGO_TEST_SECRET_KEY || PAYMONGO_SECRET_KEY);

const BASE_URL = PAYMONGO_MODE === 'live'
    ? 'https://api.paymongo.com/v1'
    : 'https://api-sandbox.paymongo.com/v1';

/**
 * PayMongo Service
 * Handles interactions with PayMongo API for payments and subscriptions.
 * 
 * PayMongo Concepts:
 * - Payment Sources: Credit cards, emails stored for recurring charges
 * - Payment Methods: Abstraction over different payment sources  
 * - Subscriptions: Recurring charges using Payment Sources
 * - Webhooks: Payment status updates
 */
class PayMongoService {
    constructor() {
        this.baseUrl = BASE_URL;
        this.publicKey = RESOLVED_PUBLIC_KEY;
        this.secretKey = RESOLVED_SECRET_KEY;
        this.webhookSecret = PAYMONGO_WEBHOOK_SECRET;
    }

    /**
     * Get authorization header for PayMongo API
     */
    getAuthHeader() {
        if (!this.secretKey) {
            throw new Error('PAYMONGO_SECRET_KEY is not configured');
        }
        const encoded = Buffer.from(`${this.secretKey}:`).toString('base64');
        return {
            'Authorization': `Basic ${encoded}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Create a Payment with PayMongo
     * @param {Object} params - Payment parameters
     * @param {number} params.amount - Amount in centavos (multiply PHP by 100)
     * @param {string} params.currency - Currency code (e.g., 'PHP')
     * @param {string} params.description - Payment description
     * @param {string} params.paymentMethodId - Payment Method ID or Source ID
     * @returns {Promise<Object>} Payment response
     */
    async createPayment({ amount, currency = 'PHP', description, paymentMethodId }) {
        try {
            const response = await axios.post(`${this.baseUrl}/payments`, {
                data: {
                    attributes: {
                        amount,
                        currency,
                        description,
                        payment_method_id: paymentMethodId,
                        statement_descriptor: 'SKUpervisor Subscription'
                    }
                }
            }, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo payment created: ${response.data.data.id}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Create Payment Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create a Payment Source for recurring charges
     * @param {Object} params - Source parameters
     * @param {string} params.type - Source type ('gcash', 'grab_pay', 'card', 'dob_ubp', 'dob_ubl')
     * @param {Object} params.details - Type-specific details
     * @returns {Promise<Object>} Source response
     */
    async createPaymentSource({ type, details }) {
        try {
            const payload = {
                data: {
                    attributes: {
                        type,
                        ...details
                    }
                }
            };

            const response = await axios.post(`${this.baseUrl}/sources`, payload, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo source created: ${response.data.data.id}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Create Source Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create a Subscription for recurring billing
     * @param {Object} params - Subscription parameters
     * @param {number} params.amount - Amount in centavos
     * @param {string} params.currency - Currency code
     * @param {string} params.interval - Billing interval ('daily', 'weekly', 'monthly', 'yearly')
     * @param {string} params.paymentMethodId - Payment Method ID for the subscription
     * @param {Object} params.metadata - Custom metadata
     * @returns {Promise<Object>} Subscription response
     */
    async createSubscription({ 
        amount, 
        currency = 'PHP', 
        interval = 'monthly',
        paymentMethodId,
        metadata = {}
    }) {
        try {
            const response = await axios.post(`${this.baseUrl}/subscriptions`, {
                data: {
                    attributes: {
                        amount,
                        currency,
                        billing_cycle: {
                            interval
                        },
                        payment_method_id: paymentMethodId,
                        metadata,
                        description: `SKUpervisor Subscription - ${metadata.plan || 'standard'}`
                    }
                }
            }, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo subscription created: ${response.data.data.id}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Create Subscription Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get Subscription Details
     * @param {string} subscriptionId - PayMongo subscription ID
     * @returns {Promise<Object>} Subscription data
     */
    async getSubscription(subscriptionId) {
        try {
            const response = await axios.get(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
                headers: this.getAuthHeader()
            });

            return response.data.data;
        } catch (error) {
            if (error.response?.status === 404) return null;
            logger.error('PayMongo Get Subscription Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Update a Subscription (e.g., change plan/amount)
     * @param {string} subscriptionId - PayMongo subscription ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated subscription
     */
    async updateSubscription(subscriptionId, updates) {
        try {
            const response = await axios.patch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
                data: {
                    attributes: updates
                }
            }, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo subscription updated: ${subscriptionId}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Update Subscription Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Cancel a Subscription
     * @param {string} subscriptionId - PayMongo subscription ID
     * @returns {Promise<Object>} Cancelled subscription
     */
    async cancelSubscription(subscriptionId) {
        try {
            const response = await axios.post(`${this.baseUrl}/subscriptions/${subscriptionId}/cancel`, {}, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo subscription cancelled: ${subscriptionId}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Cancel Subscription Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Verify Webhook Signature
     * PayMongo includes X-Paymongo-Signature header with HMAC-SHA256 of request body
     * @param {string} signature - Signature from header
     * @param {Buffer|string} body - Request body
     * @returns {boolean} True if signature is valid
     */
    verifyWebhookSignature(signature, body) {
        if (!this.webhookSecret) {
            logger.warn('PAYMONGO_WEBHOOK_SECRET not configured. Skipping signature verification (DEV/TEST ONLY).');
            return true;
        }

        try {
            const expectedSignature = crypto
                .createHmac('sha256', this.webhookSecret)
                .update(typeof body === 'string' ? body : JSON.stringify(body))
                .digest('hex');

            return signature === expectedSignature;
        } catch (error) {
            logger.error('PayMongo Webhook Signature Verification Error:', error.message);
            return false;
        }
    }

    /**
     * Get Payment Details
     * @param {string} paymentId - PayMongo payment ID
     * @returns {Promise<Object>} Payment data
     */
    async getPayment(paymentId) {
        try {
            const response = await axios.get(`${this.baseUrl}/payments/${paymentId}`, {
                headers: this.getAuthHeader()
            });

            return response.data.data;
        } catch (error) {
            if (error.response?.status === 404) return null;
            logger.error('PayMongo Get Payment Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create a Payment Link (for payment page)
     * @param {Object} params - Link parameters
     * @param {number} params.amount - Amount in centavos
     * @param {string} params.currency - Currency code
     * @param {string} params.description - Link description
     * @param {Object} params.redirectUrl - Success/failure redirect URLs
     * @returns {Promise<Object>} Payment Link data
     */
    async createPaymentLink({ amount, currency = 'PHP', description, redirectUrl }) {
        try {
            const response = await axios.post(`${this.baseUrl}/links`, {
                data: {
                    attributes: {
                        amount,
                        currency,
                        description,
                        redirect: redirectUrl
                    }
                }
            }, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo payment link created: ${response.data.data.id}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Create Link Error:', error.response?.data || error.message);
            throw error;
        }
    }
}

export const paymongoService = new PayMongoService();
