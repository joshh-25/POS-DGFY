
import axios from 'axios';
import dotenv from 'dotenv';
import logger from '../config/logger.js';

dotenv.config();

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE } = process.env;
const BASE_URL = PAYPAL_MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

/**
 * PayPal Service
 * Handles interactions with PayPal API for subscriptions and payments.
 */
class PayPalService {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    /**
     * Get PayPal Access Token
     * Returns a valid access token, refreshing if necessary.
     */
    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return this.accessToken;
        }

        try {
            const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
            const response = await axios.post(`${BASE_URL}/v1/oauth2/token`, 'grant_type=client_credentials', {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            // Set expiry 5 minutes before actual expiry to be safe
            this.tokenExpiry = new Date(new Date().getTime() + (response.data.expires_in - 300) * 1000);

            return this.accessToken;
        } catch (error) {
            logger.error('PayPal Auth Error:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with PayPal');
        }
    }

    /**
     * Create a Product (if not exists)
     * e.g., "SKU Inventory Manager Premium"
     */
    async createProduct(name, description) {
        const token = await this.getAccessToken();
        try {
            const response = await axios.post(`${BASE_URL}/v1/catalogs/products`, {
                name,
                description,
                type: 'SERVICE',
                category: 'SOFTWARE'
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            logger.error('PayPal Create Product Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create a Subscription Plan
     */
    async createPlan(productId, name, price) {
        const token = await this.getAccessToken();
        try {
            const response = await axios.post(`${BASE_URL}/v1/billing/plans`, {
                product_id: productId,
                name: name,
                description: `Monthly subscription for ${name}`,
                status: 'ACTIVE',
                billing_cycles: [
                    {
                        frequency: {
                            interval_unit: 'MONTH',
                            interval_count: 1
                        },
                        tenure_type: 'REGULAR',
                        sequence: 1,
                        total_cycles: 0, // Infinite
                        pricing_scheme: {
                            fixed_price: {
                                value: price,
                                currency_code: 'USD'
                            }
                        }
                    }
                ],
                payment_preferences: {
                    auto_bill_outstanding: true,
                    setup_fee_failure_action: 'CONTINUE',
                    payment_failure_threshold: 3
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            logger.error('PayPal Create Plan Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Verify a Subscription
     * Checks if the subscription is active.
     */
    async verifySubscription(subscriptionId) {
        // MOCK BACKDOOR FOR TESTING
        if (process.env.MOCK_PAYPAL === 'true' && process.env.NODE_ENV !== 'production') {
            logger.info(`[MOCK] Verifying Subscription ${subscriptionId}: ACTIVE`);
            return { status: 'ACTIVE', id: subscriptionId, plan_id: 'MOCK_PLAN' };
        }

        const token = await this.getAccessToken();
        try {
            const response = await axios.get(`${BASE_URL}/v1/billing/subscriptions/${subscriptionId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return response.data;
        } catch (error) {
            if (error.response?.status === 404) return null;
            logger.error('PayPal Verify Subscription Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get Subscription Details
     * Fetches full status from PayPal
     */
    async getSubscriptionDetails(subscriptionId) {
        return this.verifySubscription(subscriptionId);
    }

    /**
     * Cancel a Subscription
     */
    async cancelSubscription(subscriptionId, reason = 'User requested cancellation') {
        const token = await this.getAccessToken();
        try {
            await axios.post(`${BASE_URL}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
                reason
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            return true;
        } catch (error) {
            logger.error('PayPal Cancel Subscription Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Verify Webhook Signature
     */
    async verifyWebhookSignature(headers, eventBody) {
        // MOCK BACKDOOR FOR TESTING
        if (process.env.MOCK_PAYPAL === 'true' && process.env.NODE_ENV !== 'production') {
            logger.info('[MOCK] Skipping Webhook Signature Verification');
            return true;
        }

        const token = await this.getAccessToken();
        const webhookId = process.env.PAYPAL_WEBHOOK_ID;

        if (!webhookId) {
            if (process.env.NODE_ENV === 'production') {
                logger.error('CRITICAL: PAYPAL_WEBHOOK_ID is not configured. Rejecting webhook to prevent spoofing.');
                return false; // Fail Closed in production
            }
            logger.warn('PAYPAL_WEBHOOK_ID not found. Skipping signature verification (DEV/TEST ONLY).');
            return true; // Fail Open only outside production
        }

        try {
            const response = await axios.post(`${BASE_URL}/v1/notifications/verify-webhook-signature`, {
                auth_algo: headers['paypal-auth-algo'],
                cert_url: headers['paypal-cert-url'],
                transmission_id: headers['paypal-transmission-id'],
                transmission_sig: headers['paypal-transmission-sig'],
                transmission_time: headers['paypal-transmission-time'],
                webhook_id: webhookId,
                webhook_event: eventBody
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.verification_status === 'SUCCESS';
        } catch (error) {
            logger.error('PayPal Webhook Verification Error:', error.response?.data || error.message);
            return false;
        }
    }
}

export const paypalService = new PayPalService();
