import { paypalService } from '../services/paypalService.js';
import db from '../models/index.js'; // Assuming default export is the db object
import logger from '../config/logger.js';

const { Tenant, Payment, WebhookLog } = db;

/**
 * Handle PayPal Webhooks
 * POST /api/v1/payments/webhook
 */
export const handleWebhook = async (req, res) => {
    try {
        const body = req.body;
        const headers = req.headers;
        const eventType = body.event_type;
        const resource = body.resource;
        const webhookId = headers['paypal-transmission-id'];

        logger.info(`Received PayPal Webhook: ${eventType}`, { webhookId, resourceId: resource.id });

        // 1. Verify Webhook Signature
        const isValid = await paypalService.verifyWebhookSignature(headers, body);
        if (!isValid) {
            logger.error(`Invalid PayPal Webhook Signature for ID: ${webhookId}`);
            return res.status(401).send('Invalid Signature');
        }

        // 2. Idempotency Check
        const existingLog = await WebhookLog.findOne({ where: { webhook_id: webhookId } });
        if (existingLog && existingLog.status === 'processed') {
            logger.info(`Webhook ${webhookId} already processed. Skipping.`);
            return res.status(200).send('OK');
        }

        // 3. Log or Update Webhook Entry
        const [log] = await WebhookLog.findOrCreate({
            where: { webhook_id: webhookId },
            defaults: {
                event_type: eventType,
                resource_id: resource.id,
                status: 'pending'
            }
        });

        try {
            switch (eventType) {
                case 'PAYMENT.SALE.COMPLETED':
                    await handlePaymentCompleted(resource);
                    break;
                case 'BILLING.SUBSCRIPTION.CANCELLED':
                case 'BILLING.SUBSCRIPTION.SUSPENDED':
                case 'BILLING.SUBSCRIPTION.EXPIRED':
                    await handleSubscriptionCancelled(resource);
                    break;
                case 'BILLING.SUBSCRIPTION.ACTIVATED':
                    await handleSubscriptionActivated(resource);
                    break;
                default:
                    logger.info(`Unhandled Webhook Event: ${eventType}`);
            }

            // Update log as processed
            await log.update({
                status: 'processed',
                processed_at: new Date()
            });

        } catch (procError) {
            logger.error(`Error processing webhook contents: ${procError.message}`);
            await log.update({
                status: 'failed',
                error_message: procError.message
            });
            throw procError; // Re-throw to hit 500 handler
        }

        res.status(200).send('OK');
    } catch (error) {
        logger.error('Webhook Handling Error:', error);
        res.status(500).send('Internal Server Error');
    }
};

/**
 * Handle Payment Completed
 * Updates payment history and ensures tenant is active.
 */
async function handlePaymentCompleted(resource) {
    const subscriptionId = resource.billing_agreement_id; // For subscriptions
    const transactionId = resource.id;
    const amount = resource.amount.total;
    const currency = resource.amount.currency;

    if (!subscriptionId) {
        logger.warn('Payment event missing billing_agreement_id', resource);
        return;
    }

    // Find tenant by subscription ID
    const tenant = await Tenant.findOne({ where: { paypal_subscription_id: subscriptionId } });

    if (!tenant) {
        logger.error(`Tenant not found for subscription: ${subscriptionId}`);
        return;
    }

    // Record Payment
    await Payment.create({
        tenant_id: tenant.id,
        transaction_id: transactionId,
        amount: amount,
        currency: currency,
        status: 'completed',
        payment_method: 'paypal',
        metadata: resource
    });

    // Update Tenant Status
    // Extend current_period_end by 1 month (simplified logic)
    // Precise logic should use 'next_billing_date' from PayPal if available, or just add 30 days
    const newPeriodEnd = new Date();
    newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

    tenant.subscription_status = 'active';
    tenant.current_period_end = newPeriodEnd;
    await tenant.save();

    logger.info(`Payment verified for tenant ${tenant.name}. Subscription extended.`);
}

/**
 * Handle Subscription Activated
 */
async function handleSubscriptionActivated(resource) {
    const subscriptionId = resource.id;
    const tenant = await Tenant.findOne({ where: { paypal_subscription_id: subscriptionId } });

    if (!tenant) {
        logger.warn(`Subscription activated for unknown tenant: ${subscriptionId}`);
        return; // Logic might be handled in registration callback
    }

    tenant.subscription_status = 'active';
    await tenant.save();
    logger.info(`Subscription activated for tenant ${tenant.name}`);
}

/**
 * Handle Subscription Cancelled/Suspended
 */
async function handleSubscriptionCancelled(resource) {
    const subscriptionId = resource.id;
    const tenant = await Tenant.findOne({ where: { paypal_subscription_id: subscriptionId } });

    if (!tenant) {
        logger.warn(`Subscription cancelled for unknown tenant: ${subscriptionId}`);
        return;
    }

    tenant.subscription_status = 'cancelled';
    // We don't immediately revoke access; we wait for current_period_end.
    // But for now, let's just mark status.
    await tenant.save();
    logger.info(`Subscription cancelled for tenant ${tenant.name}`);
}

// Dev Tool: Simulate Webhook
export const simulateWebhook = async (req, res) => {
    // ... logic ...
};

/**
 * Cancel Subscription
 * POST /api/v1/payments/cancel
 */
export const cancelSubscription = async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const tenant = await Tenant.findByPk(tenantId);

        if (!tenant || !tenant.paypal_subscription_id) {
            return res.status(400).json({ success: false, message: 'No active subscription found' });
        }

        // 1. Tell PayPal to cancel
        await paypalService.cancelSubscription(tenant.paypal_subscription_id);

        // 2. Update local record
        // We mark it as 'cancelled' but don't revoke access yet.
        await tenant.update({
            subscription_status: 'cancelled',
            cancelled_at: new Date()
        });

        logger.info(`Subscription cancelled for tenant ${tenant.name}`);

        res.json({
            success: true,
            message: 'Subscription cancelled. You will still have Premium access until the end of your billing cycle.',
            data: {
                subscription_status: 'cancelled',
                current_period_end: tenant.current_period_end
            }
        });
    } catch (error) {
        logger.error('Cancellation Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get Billing History
 * GET /api/v1/payments/history
 */
export const getBillingHistory = async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const payments = await Payment.findAll({
            where: { tenant_id: tenantId },
            order: [['createdAt', 'DESC']]
        });

        res.json({
            success: true,
            data: payments
        });
    } catch (error) {
        logger.error('History Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Sync with PayPal
 * POST /api/v1/payments/sync
 */
export const syncWithPayPal = async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const tenant = await Tenant.findByPk(tenantId);

        if (!tenant || !tenant.paypal_subscription_id) {
            return res.status(400).json({ success: false, message: 'No subscription ID for this tenant' });
        }

        const details = await paypalService.getSubscriptionDetails(tenant.paypal_subscription_id);
        if (!details) {
            return res.status(404).json({ success: false, message: 'Subscription not found in PayPal' });
        }

        // Determine local status based on PayPal status
        // PayPal statuses: APPROVAL_PENDING, APPROVED, ACTIVE, SUSPENDED, CANCELLED, EXPIRED
        let localStatus = 'inactive';
        if (details.status === 'ACTIVE') localStatus = 'active';
        else if (details.status === 'CANCELLED') localStatus = 'cancelled';
        else if (details.status === 'SUSPENDED') localStatus = 'past_due';

        await tenant.update({
            subscription_status: localStatus,
            current_period_end: details.billing_info?.next_billing_time ? new Date(details.billing_info.next_billing_time) : tenant.current_period_end
        });

        res.json({
            success: true,
            message: 'Subscription synchronized with PayPal',
            data: {
                status: localStatus,
                current_period_end: tenant.current_period_end
            }
        });
    } catch (error) {
        logger.error('Sync Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Handle Real-time Upgrade
 * POST /api/v1/payments/upgrade
 */
export const upgradeToPremium = async (req, res) => {
    try {
        const { subscriptionId } = req.body;
        const tenantId = req.tenant.id;

        if (!subscriptionId) {
            return res.status(400).json({ success: false, message: 'Subscription ID is required' });
        }

        // Verify with PayPal
        const subDetails = await paypalService.verifySubscription(subscriptionId);
        if (!subDetails || (subDetails.status !== 'ACTIVE' && subDetails.status !== 'APPROVAL_PENDING')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subscription status: ' + (subDetails?.status || 'Unknown')
            });
        }

        // Update Tenant
        const tenant = await Tenant.findByPk(tenantId);
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        const newPeriodEnd = new Date();
        newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

        await tenant.update({
            plan: 'premium',
            subscription_status: 'active',
            paypal_subscription_id: subscriptionId,
            current_period_end: newPeriodEnd
        });

        logger.info(`Tenant ${tenant.name} upgraded to Premium via real-time request.`);

        res.json({
            success: true,
            message: 'Upgrade successful! Welcome to Premium.',
            data: {
                plan: 'premium',
                subscription_status: 'active',
                current_period_end: newPeriodEnd
            }
        });

    } catch (error) {
        logger.error('Upgrade Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
