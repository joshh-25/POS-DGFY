import axios from 'axios';
import dotenv from 'dotenv';
import logger from '../config/logger.js';

dotenv.config();

const resolveBaseUrl = () => (
    process.env.PAYPAL_MODE === 'sandbox'
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com'
);

const isMockMode = () => process.env.MOCK_PAYPAL === 'true' && process.env.NODE_ENV !== 'production';

class PayPalService {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return this.accessToken;
        }

        const clientId = process.env.PAYPAL_CLIENT_ID;
        const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new Error('PayPal credentials are not configured');
        }

        try {
            const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            const response = await axios.post(
                `${resolveBaseUrl()}/v1/oauth2/token`,
                'grant_type=client_credentials',
                {
                    headers: {
                        Authorization: `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);
            return this.accessToken;
        } catch (error) {
            logger.error('PayPal Auth Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async verifySubscription(subscriptionId) {
        if (isMockMode()) {
            logger.info(`[MOCK] Verifying Subscription ${subscriptionId}: ACTIVE`);
            return { status: 'ACTIVE', id: subscriptionId, plan_id: process.env.PAYPAL_PREMIUM_PLAN_ID || 'MOCK_PLAN' };
        }

        const token = await this.getAccessToken();
        try {
            const response = await axios.get(
                `${resolveBaseUrl()}/v1/billing/subscriptions/${subscriptionId}`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            return response.data;
        } catch (error) {
            if (error.response?.status === 404) return null;
            logger.error('PayPal Verify Subscription Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async getSubscriptionDetails(subscriptionId) {
        return this.verifySubscription(subscriptionId);
    }

    async cancelSubscription(subscriptionId, reason = 'User requested cancellation') {
        if (isMockMode()) return true;

        const token = await this.getAccessToken();
        try {
            await axios.post(
                `${resolveBaseUrl()}/v1/billing/subscriptions/${subscriptionId}/cancel`,
                { reason },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return true;
        } catch (error) {
            logger.error('PayPal Cancel Subscription Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async reviseSubscription(subscriptionId, newPlanId) {
        if (isMockMode()) {
            return {
                id: subscriptionId,
                links: [
                    {
                        rel: 'approve',
                        href: `https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-MOCK-${Date.now()}`
                    }
                ]
            };
        }

        const token = await this.getAccessToken();
        const appUrl = process.env.APP_URL || 'http://localhost:5173';
        try {
            const response = await axios.post(
                `${resolveBaseUrl()}/v1/billing/subscriptions/${subscriptionId}/revise`,
                {
                    plan_id: newPlanId,
                    application_context: {
                        brand_name: 'SKUpervisor',
                        return_url: `${appUrl}/settings?tab=subscription&revision=success`,
                        cancel_url: `${appUrl}/settings?tab=subscription&revision=cancelled`
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            logger.error('PayPal Revise Subscription Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async createSubscriptionServerSide(planId, subscriberEmail, returnUrl, cancelUrl) {
        if (isMockMode()) {
            const mockSubId = `I-MOCK${Date.now()}`;
            logger.info(`[MOCK] Creating server-side subscription for ${subscriberEmail}: ${mockSubId}`);
            return {
                subscriptionId: mockSubId,
                approvalUrl: `https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-MOCK${Date.now()}`
            };
        }

        const token = await this.getAccessToken();
        try {
            const response = await axios.post(
                `${resolveBaseUrl()}/v1/billing/subscriptions`,
                {
                    plan_id: planId,
                    subscriber: { email_address: subscriberEmail },
                    application_context: {
                        brand_name: 'SKUpervisor',
                        user_action: 'SUBSCRIBE_NOW',
                        return_url: returnUrl,
                        cancel_url: cancelUrl
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        Prefer: 'return=representation'
                    }
                }
            );
            const data = response.data;
            const approveLink = (data.links || []).find((link) => link.rel === 'approve');
            return {
                subscriptionId: data.id,
                approvalUrl: approveLink ? approveLink.href : null
            };
        } catch (error) {
            logger.error('PayPal Create Server-Side Subscription Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async verifyWebhookSignature(headers, eventBody) {
        if (isMockMode()) {
            logger.info('[MOCK] Skipping Webhook Signature Verification');
            return true;
        }

        const webhookId = process.env.PAYPAL_WEBHOOK_ID;
        if (!webhookId) {
            if (process.env.NODE_ENV === 'production') {
                logger.error('CRITICAL: PAYPAL_WEBHOOK_ID is not configured. Rejecting webhook to prevent spoofing.');
                return false;
            }
            logger.warn('PAYPAL_WEBHOOK_ID not found. Skipping signature verification (DEV/TEST ONLY).');
            return true;
        }

        const token = await this.getAccessToken();
        try {
            const response = await axios.post(
                `${resolveBaseUrl()}/v1/notifications/verify-webhook-signature`,
                {
                    auth_algo: headers['paypal-auth-algo'],
                    cert_url: headers['paypal-cert-url'],
                    transmission_id: headers['paypal-transmission-id'],
                    transmission_sig: headers['paypal-transmission-sig'],
                    transmission_time: headers['paypal-transmission-time'],
                    webhook_id: webhookId,
                    webhook_event: eventBody
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data.verification_status === 'SUCCESS';
        } catch (error) {
            logger.error('PayPal Webhook Verification Error:', error.response?.data || error.message);
            return false;
        }
    }
}

export const paypalService = new PayPalService();
