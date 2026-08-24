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
    PAYMONGO_TEST_WEBHOOK_SECRET,
    PAYMONGO_LIVE_WEBHOOK_SECRET,
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

const RESOLVED_WEBHOOK_SECRET = PAYMONGO_MODE === 'live'
    ? (PAYMONGO_LIVE_WEBHOOK_SECRET || PAYMONGO_WEBHOOK_SECRET)
    : (PAYMONGO_TEST_WEBHOOK_SECRET || PAYMONGO_WEBHOOK_SECRET);

const BASE_URL = process.env.PAYMONGO_API_BASE_URL || 'https://api.paymongo.com/v1';
const ACCOUNTS_BASE_URL = process.env.PAYMONGO_ACCOUNTS_API_BASE_URL || 'https://api.paymongo.com/v2';
const SECURE_AUTHENTICATION_API_BASE_URL = 'https://secure-authentication-api.paymongo.com';

const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = Number.parseInt(
    process.env.PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS || '300',
    10
);

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
export class PayMongoService {
    constructor() {
        this.baseUrl = BASE_URL;
        this.accountsBaseUrl = ACCOUNTS_BASE_URL;
        this.publicKey = RESOLVED_PUBLIC_KEY;
        this.secretKey = RESOLVED_SECRET_KEY;
        this.webhookSecret = RESOLVED_WEBHOOK_SECRET;
        this.paymentMethodCapabilitiesCache = null;
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

    async createChildMerchant({ tradeName, type = 'merchant', features = ['payment_gateway', 'basic_wallet'], metadata = {} }) {
        try {
            const cleanTradeName = String(tradeName || '').trim();
            if (!cleanTradeName) {
                throw new Error('tradeName is required to create a PayMongo child merchant');
            }

            const response = await axios.post(`${this.baseUrl}/merchants/children`, {
                data: {
                    attributes: {
                        type,
                        trade_name: cleanTradeName,
                        features,
                        metadata
                    }
                }
            }, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo child merchant created: ${response.data?.data?.id || cleanTradeName}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Create Child Merchant Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async listChildAccounts(params = {}) {
        try {
            const response = await axios.get(`${this.baseUrl}/merchants/child_accounts`, {
                headers: this.getAuthHeader(),
                params
            });
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo List Child Accounts Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async retrieveChildMerchantRequirements(childMerchantId) {
        try {
            const cleanChildMerchantId = String(childMerchantId || '').trim();
            if (!cleanChildMerchantId) {
                throw new Error('childMerchantId is required to retrieve PayMongo child merchant requirements');
            }

            const response = await axios.get(`${this.baseUrl}/merchants/children/${cleanChildMerchantId}/requirements`, {
                headers: this.getAuthHeader()
            });

            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Retrieve Child Merchant Requirements Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async submitChildMerchantForReview(childMerchantId) {
        try {
            const cleanChildMerchantId = String(childMerchantId || '').trim();
            if (!cleanChildMerchantId) {
                throw new Error('childMerchantId is required to submit PayMongo child merchant for review');
            }

            const response = await axios.post(`${this.baseUrl}/merchants/children/${cleanChildMerchantId}/submit`, {
                data: { attributes: {} }
            }, {
                headers: this.getAuthHeader()
            });

            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Submit Child Merchant Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async activateAccount(accountId) {
        try {
            const cleanAccountId = String(accountId || '').trim();
            if (!cleanAccountId) {
                throw new Error('accountId is required to activate PayMongo account');
            }

            const response = await axios.post(`${this.accountsBaseUrl}/accounts/${cleanAccountId}/activate`, {
                data: { attributes: {} }
            }, {
                headers: this.getAuthHeader()
            });

            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Activate Account Error:', error.response?.data || error.message);
            throw error;
        }
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

    async createPaymentIntent({
        amount,
        currency = 'PHP',
        description,
        paymentMethodAllowed = ['qrph'],
        metadata = {},
        splitPayment = null,
        paymentMethodOptions = null
    }) {
        try {
            const attributes = {
                amount,
                currency,
                description,
                payment_method_allowed: paymentMethodAllowed,
                metadata
            };

            if (splitPayment) {
                attributes.split_payment = splitPayment;
            }

            if (paymentMethodOptions) {
                attributes.payment_method_options = paymentMethodOptions;
            }

            const response = await axios.post(`${this.baseUrl}/payment_intents`, {
                data: { attributes }
            }, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo payment intent created: ${response.data.data.id}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Create Payment Intent Error:', error.response?.data || error.message);
            throw error;
        }
    }

    getPublicKey() {
        return this.publicKey || null;
    }

    async createDirectWalletPaymentIntent({
        amount,
        currency = 'PHP',
        description,
        metadata = {},
        returnUrl = null,
        paymentMethod,
        paymentFlow,
        paymentMethodLabel
    }) {
        const publicKey = this.getPublicKey();
        if (!publicKey) {
            throw new Error('PAYMONGO_PUBLIC_KEY is not configured');
        }

        const allowedPaymentMethods = new Set(['gcash', 'paymaya', 'card']);
        if (!allowedPaymentMethods.has(paymentMethod)) {
            throw new Error('Direct PayMongo payment method is not supported');
        }

        const paymentIntent = await this.createPaymentIntent({
            amount,
            currency,
            description,
            paymentMethodAllowed: [paymentMethod],
            metadata,
            paymentMethodOptions: paymentMethod === 'card'
                ? { card: { request_three_d_secure: 'automatic' } }
                : null
        });
        const clientKey = String(paymentIntent?.attributes?.client_key || '').trim();
        if (!paymentIntent?.id || !clientKey) {
            throw new Error(`PayMongo did not return a usable ${paymentMethodLabel} Payment Intent client key`);
        }

        return {
            paymentFlow,
            paymentIntent,
            publicKey,
            returnUrl
        };
    }

    async createDirectGcashPaymentIntent(params = {}) {
        return this.createDirectWalletPaymentIntent({
            ...params,
            paymentMethod: 'gcash',
            paymentFlow: 'direct_gcash',
            paymentMethodLabel: 'GCash'
        });
    }

    async createDirectMayaPaymentIntent(params = {}) {
        return this.createDirectWalletPaymentIntent({
            ...params,
            paymentMethod: 'paymaya',
            paymentFlow: 'direct_maya',
            paymentMethodLabel: 'Maya'
        });
    }

    async createDirectPaymentIntent(params = {}) {
        return this.createDirectWalletPaymentIntent(params);
    }

    async createDirectCardPaymentIntent(params = {}) {
        return this.createDirectWalletPaymentIntent({
            ...params,
            paymentMethod: 'card',
            paymentFlow: 'direct_card',
            paymentMethodLabel: 'Card'
        });
    }

    async getPaymentMethodCapabilities({ cacheTtlMs = 15_000 } = {}) {
        const now = Date.now();
        if (this.paymentMethodCapabilitiesCache && this.paymentMethodCapabilitiesCache.expiresAt > now) {
            return this.paymentMethodCapabilitiesCache.methods;
        }

        try {
            const response = await axios.get(`${this.baseUrl}/merchants/capabilities/payment_methods`, {
                headers: this.getAuthHeader()
            });
            const payload = Array.isArray(response.data) ? response.data : response.data?.data;
            const methods = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload?.attributes?.payment_methods)
                    ? payload.attributes.payment_methods
                    : (Array.isArray(response.data?.payment_methods) ? response.data.payment_methods : []));
            const normalized = [...new Set(methods.map((method) => String(method || '').trim().toLowerCase()).filter(Boolean))];
            this.paymentMethodCapabilitiesCache = {
                methods: normalized,
                expiresAt: now + Math.max(0, Number(cacheTtlMs) || 0)
            };
            return normalized;
        } catch (error) {
            logger.warn('PayMongo payment method capability lookup failed:', error.response?.data || error.message);
            throw error;
        }
    }

    async createHostedCheckoutSession({
        amount,
        currency = 'PHP',
        description,
        lineItems = [],
        paymentMethodTypes = [],
        billing,
        showDescription,
        showLineItems,
        successUrl,
        cancelUrl,
        referenceNumber,
        metadata = {}
    }) {
        const attributes = {
            line_items: lineItems,
            payment_method_types: paymentMethodTypes,
            success_url: successUrl,
            cancel_url: cancelUrl,
            reference_number: referenceNumber,
            metadata
        };
        if (description) attributes.description = description;
        if (lineItems.length === 0 && Number.isFinite(Number(amount)) && Number(amount) > 0) {
            attributes.line_items = [{
                name: description || 'DGFY storefront order',
                amount: Math.round(Number(amount)),
                currency,
                quantity: 1
            }];
        }
        // Forwarded only when the caller actually supplies them -- the one
        // production caller today (storeUseCases.js) passes none of these
        // three, and PayMongo's own checkout-session defaults (show its
        // built-in billing form, show the description/line-item summary)
        // are exactly what that caller already relies on implicitly. Only
        // set when explicitly provided so that path is unaffected.
        if (billing && typeof billing === 'object' && Object.keys(billing).length > 0) {
            attributes.billing = billing;
        }
        if (typeof showDescription === 'boolean') attributes.show_description = showDescription;
        if (typeof showLineItems === 'boolean') attributes.show_line_items = showLineItems;

        try {
            const response = await axios.post(`${this.accountsBaseUrl}/checkout_sessions`, {
                data: { attributes }
            }, {
                headers: this.getAuthHeader()
            });
            logger.info(`PayMongo Hosted Checkout session created: ${response.data?.data?.id || referenceNumber}`);
            return response.data?.data || null;
        } catch (error) {
            logger.error('PayMongo Hosted Checkout session creation failed:', error.response?.data || error.message);
            throw error;
        }
    }

    async createPaymentMethod({ type = 'qrph', billing = {}, metadata = {} }) {
        try {
            const response = await axios.post(`${this.baseUrl}/payment_methods`, {
                data: {
                    attributes: {
                        type,
                        billing,
                        metadata
                    }
                }
            }, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo payment method created: ${response.data.data.id}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Create Payment Method Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async attachPaymentIntent({ paymentIntentId, paymentMethodId, returnUrl = null }) {
        try {
            const attributes = {
                payment_method: paymentMethodId
            };
            if (returnUrl) attributes.return_url = returnUrl;

            const response = await axios.post(`${this.baseUrl}/payment_intents/${paymentIntentId}/attach`, {
                data: { attributes }
            }, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo payment intent attached: ${paymentIntentId}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Attach Payment Intent Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async retrievePaymentIntent(paymentIntentId) {
        try {
            const cleanPaymentIntentId = String(paymentIntentId || '').trim();
            if (!cleanPaymentIntentId.startsWith('pi_')) {
                throw new Error('A valid PayMongo payment intent ID is required');
            }

            const response = await axios.get(`${this.baseUrl}/payment_intents/${cleanPaymentIntentId}`, {
                headers: this.getAuthHeader()
            });
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Retrieve Payment Intent Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async confirmSandboxQrphPayment({
        paymentIntentId,
        expectedAmount,
        expectedCurrency = 'PHP'
    }) {
        if (PAYMONGO_MODE !== 'test') {
            throw new Error('PayMongo sandbox confirmation is unavailable outside test mode');
        }

        const paymentIntent = await this.retrievePaymentIntent(paymentIntentId);
        const attributes = paymentIntent?.attributes || {};
        if (
            Number(attributes.amount) !== Number(expectedAmount)
            || String(attributes.currency || '').toUpperCase() !== String(expectedCurrency || '').toUpperCase()
        ) {
            throw new Error('PayMongo sandbox payment amount or currency does not match this checkout');
        }
        const code = attributes.next_action?.code || {};
        const testUrl = String(code.test_url || '').trim();
        const sourceId = new URL(testUrl).searchParams.get('id') || '';
        const codeId = String(code.id || new URL(testUrl).searchParams.get('code_id') || '').trim();

        if (!sourceId.startsWith('src_') || !codeId.startsWith('qr_')) {
            throw new Error('PayMongo did not return a confirmable sandbox QR Ph source');
        }

        const response = await axios.post(
            `${SECURE_AUTHENTICATION_API_BASE_URL}/sources/${sourceId}/charge`,
            { code_id: codeId },
            { headers: { 'Content-Type': 'application/json' } }
        );

        return {
            paymentIntent,
            source: response.data?.data || null
        };
    }

    async createQrphPaymentIntent({
        amount,
        currency = 'PHP',
        description,
        billing = {},
        metadata = {},
        splitPayment = null,
        returnUrl = null
    }) {
        const paymentIntent = await this.createPaymentIntent({
            amount,
            currency,
            description,
            paymentMethodAllowed: ['qrph'],
            metadata,
            splitPayment
        });
        const paymentMethod = await this.createPaymentMethod({
            type: 'qrph',
            billing,
            metadata
        });
        const attachedIntent = await this.attachPaymentIntent({
            paymentIntentId: paymentIntent.id,
            paymentMethodId: paymentMethod.id,
            returnUrl
        });

        const nextAction = attachedIntent?.attributes?.next_action || {};
        const code = nextAction?.code || {};
        const expiresAt = code?.expires_at || nextAction?.expires_at || attachedIntent?.attributes?.expires_at || null;

        return {
            paymentIntent,
            paymentMethod,
            attachedIntent,
            qrCodeImageUrl: code?.image_url || code?.imageUrl || null,
            checkoutUrl: nextAction?.redirect?.url || nextAction?.redirect_url || null,
            expiresAt
        };
    }

    async createRefund({
        amount,
        paymentId,
        reason = 'requested_by_customer',
        notes = null,
        splitRefund = null
    }) {
        try {
            const attributes = {
                amount,
                payment_id: paymentId,
                reason
            };
            if (notes) attributes.notes = String(notes).slice(0, 255);
            if (splitRefund) attributes.split_refund = splitRefund;

            const refundsBaseUrl = this.baseUrl.replace(/\/v1$/, '');
            const response = await axios.post(`${refundsBaseUrl}/refunds`, {
                data: { attributes }
            }, {
                headers: this.getAuthHeader()
            });

            logger.info(`PayMongo refund created: ${response.data.data.id}`);
            return response.data.data;
        } catch (error) {
            logger.error('PayMongo Create Refund Error:', error.response?.data || error.message);
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
     * PayMongo includes Paymongo-Signature with HMAC-SHA256 of `${timestamp}.${rawBody}`.
     * @param {string} signature - Signature from header
     * @param {Buffer|string} body - Request body
     * @returns {boolean} True if signature is valid
     */
    verifyWebhookSignature(signature, body) {
        if (!this.webhookSecret) {
            const allowUnsignedWebhook = process.env.PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS === 'true'
                && process.env.NODE_ENV !== 'production'
                && PAYMONGO_MODE !== 'live'
                && process.env.PAYMENTS_ENABLED !== 'true';

            if (allowUnsignedWebhook) {
                logger.warn('PayMongo webhook signature verification bypassed by PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS (non-production only).');
                return true;
            }
            logger.warn('PayMongo webhook secret is not configured; rejecting webhook.');
            return false;
        }

        try {
            const signatureParts = String(signature || '')
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
                .reduce((parts, part) => {
                    const [key, ...valueParts] = part.split('=');
                    if (key && valueParts.length > 0) {
                        parts[key.trim()] = valueParts.join('=').trim();
                    }
                    return parts;
                }, {});

            const timestamp = signatureParts.t;
            const modeSignature = PAYMONGO_MODE === 'live' ? signatureParts.li : signatureParts.te;
            if (!timestamp || !modeSignature) {
                return false;
            }

            const timestampSeconds = Number.parseInt(timestamp, 10);
            const toleranceSeconds = Number.isFinite(WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS)
                ? WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
                : 300;
            if (!Number.isFinite(timestampSeconds)
                || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > toleranceSeconds) {
                logger.warn('PayMongo webhook rejected due to stale or invalid timestamp.');
                return false;
            }

            const rawBody = Buffer.isBuffer(body)
                ? body.toString('utf8')
                : (typeof body === 'string' ? body : JSON.stringify(body));
            const expectedSignature = crypto
                .createHmac('sha256', this.webhookSecret)
                .update(`${timestamp}.${rawBody}`)
                .digest('hex');

            const expectedBuffer = Buffer.from(expectedSignature, 'hex');
            const providedBuffer = Buffer.from(modeSignature, 'hex');
            return expectedBuffer.length === providedBuffer.length
                && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
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
