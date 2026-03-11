import crypto from 'crypto';
import logger from '../../../config/logger.js';
import {
    handleWebhookUseCase,
    cancelSubscriptionUseCase,
    getBillingHistoryUseCase,
    syncWithPayPalUseCase,
    upgradeToPremiumUseCase,
    migrateToPayPalUseCase,
    changePlanUseCase,
    requestReactivationUseCase,
    reactivateWithPayPalUseCase,
    paymentRepository
} from '../index.js';
import { resolveDomainFailure, sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const requireTenantContext = (req, res) => {
    if (!req.tenant?.id) {
        res.status(400).json({ success: false, message: 'Company token required' });
        return null;
    }
    return req.tenant.id;
};

/**
 * Handle PayPal Webhooks
 * POST /api/v1/payments/webhook
 */
export const handleWebhook = async (req, res) => {
    try {
        const result = await handleWebhookUseCase({
            body: req.body,
            headers: req.headers
        });

        if (!result.success) {
            const failure = resolveDomainFailure(result, 500, 'Internal Server Error');
            const responseFormat = failure.details?.responseFormat || 'text';

            if (responseFormat === 'text') {
                return res.status(failure.statusCode).send(failure.message);
            }

            return res.status(failure.statusCode).json({
                success: false,
                message: failure.message
            });
        }

        return res.status(200).send(result.data?.body || 'OK');
    } catch (error) {
        logger.error('Webhook Handling Error:', error);
        return res.status(500).send('Internal Server Error');
    }
};

// Dev Tool: Simulate Webhook
export const simulateWebhook = async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                message: 'Webhook simulation is disabled in production'
            });
        }

        const eventType = req.body?.event_type;
        const resource = req.body?.resource || {};

        if (!eventType || typeof eventType !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'event_type is required'
            });
        }

        const simulatedBody = {
            id: req.body?.id || `SIM-${Date.now()}`,
            event_type: eventType,
            resource
        };

        const simulatedHeaders = {
            ...req.headers,
            'paypal-transmission-id': req.headers?.['paypal-transmission-id'] || `sim-${Date.now()}`
        };

        const result = await handleWebhookUseCase({
            body: simulatedBody,
            headers: simulatedHeaders,
            bypassSignature: true
        });

        if (!result.success) {
            const failure = resolveDomainFailure(result);
            return res.status(failure.statusCode).json({
                success: false,
                message: failure.message
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Simulated webhook processed successfully',
            data: {
                event_type: simulatedBody.event_type,
                webhook_id: simulatedBody.id
            }
        });
    } catch (error) {
        logger.error('Webhook Simulation Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to process simulated webhook'
        });
    }
};

/**
 * Cancel Subscription
 * POST /api/v1/payments/cancel
 */
export const cancelSubscription = async (req, res) => {
    try {
        const tenantId = requireTenantContext(req, res);
        if (!tenantId) return;
        const result = await cancelSubscriptionUseCase({ tenantId });
        return sendUseCaseResult(res, result, {
            successPayloadResolver: () => ({
                success: true,
                message: 'Subscription cancelled. You will still have Premium access until the end of your billing cycle.',
                data: result.data
            })
        });
    } catch (error) {
        logger.error('Cancellation Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get Billing History
 * GET /api/v1/payments/history
 */
export const getBillingHistory = async (req, res) => {
    try {
        const tenantId = requireTenantContext(req, res);
        if (!tenantId) return;
        const result = await getBillingHistoryUseCase({ tenantId });
        return sendUseCaseResult(res, result, {
            successPayloadResolver: () => ({
                success: true,
                data: result.data
            })
        });
    } catch (error) {
        logger.error('History Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Sync with PayPal
 * POST /api/v1/payments/sync
 */
export const syncWithPayPal = async (req, res) => {
    try {
        const tenantId = requireTenantContext(req, res);
        if (!tenantId) return;
        const result = await syncWithPayPalUseCase({ tenantId });
        return sendUseCaseResult(res, result, {
            successPayloadResolver: () => ({
                success: true,
                message: 'Subscription synchronized with PayPal',
                data: result.data
            })
        });
    } catch (error) {
        logger.error('Sync Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Handle Real-time Upgrade
 * POST /api/v1/payments/upgrade
 */
export const upgradeToPremium = async (req, res) => {
    try {
        const { subscriptionId } = req.body;
        const tenantId = requireTenantContext(req, res);
        if (!tenantId) return;
        const userId = req.user?.user_id || null;
        const correlationId = req.requestId || req.headers['x-request-id'] || crypto.randomUUID();

        const result = await upgradeToPremiumUseCase({
            tenantId,
            userId,
            subscriptionId,
            correlationId
        });
        return sendUseCaseResult(res, result, {
            successPayloadResolver: () => ({
                success: true,
                message: 'Upgrade successful! Welcome to Premium.',
                data: result.data
            })
        });
    } catch (error) {
        logger.error('Upgrade Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Migrate from manual billing to PayPal recurring
 * POST /api/v1/payments/migrate-to-paypal
 */
export const migrateToPayPal = async (req, res) => {
    try {
        const { subscriptionId } = req.body;
        const tenantId = requireTenantContext(req, res);
        if (!tenantId) return;
        const userId = req.user?.user_id || null;
        const correlationId = req.requestId || req.headers['x-request-id'] || crypto.randomUUID();
        const result = await migrateToPayPalUseCase({ tenantId, userId, subscriptionId, correlationId });
        return sendUseCaseResult(res, result, {
            successPayloadResolver: () => ({
                success: true,
                message: 'Successfully migrated to PayPal recurring billing.',
                data: result.data
            })
        });
    } catch (error) {
        logger.error('Migrate to PayPal Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Change subscription plan
 * POST /api/v1/payments/change-plan
 */
export const changePlan = async (req, res) => {
    try {
        const { newPlan } = req.body;
        const tenantId = requireTenantContext(req, res);
        if (!tenantId) return;
        const result = await changePlanUseCase({ tenantId, newPlan });
        return sendUseCaseResult(res, result, {
            successPayloadResolver: () => ({
                success: true,
                message: result.data?.requiresConsent
                    ? 'Plan change initiated. Please complete approval on PayPal.'
                    : 'Plan changed successfully.',
                data: result.data
            })
        });
    } catch (error) {
        logger.error('Change Plan Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get pending plan change status
 * GET /api/v1/payments/pending-plan
 */
export const getPendingPlan = async (req, res) => {
    try {
        const tenantId = requireTenantContext(req, res);
        if (!tenantId) return;
        const tenant = await paymentRepository.findTenantById(tenantId);
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        return res.json({
            success: true,
            data: {
                pending_plan: tenant.pending_plan || null,
                pending_plan_change_date: tenant.pending_plan_change_date || null,
                pending_plan_approved: tenant.pending_plan_approved || false
            }
        });
    } catch (error) {
        logger.error('Get Pending Plan Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Request manual reactivation (for inactive tenants)
 * POST /api/v1/payments/request-reactivation
 * No JWT required — tenant identified via tenantHandler (x-company-token)
 */
export const requestReactivation = async (req, res) => {
    try {
        if (!req.tenant) {
            return res.status(400).json({ success: false, message: 'Company token required' });
        }
        const tenantId = req.tenant.id;
        const result = await requestReactivationUseCase({ tenantId });
        return sendUseCaseResult(res, result, {
            successPayloadResolver: () => ({
                success: true,
                message: result.data?.message || 'Reactivation request submitted.',
                data: result.data
            })
        });
    } catch (error) {
        logger.error('Request Reactivation Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Self-service reactivation via PayPal for inactive tenants
 * POST /api/v1/payments/reactivate-with-paypal
 * No JWT required — tenant identified via tenantHandler (x-company-token)
 */
export const reactivateWithPayPal = async (req, res) => {
    try {
        if (!req.tenant) {
            return res.status(400).json({ success: false, message: 'Company token required' });
        }
        const { subscriptionId } = req.body;
        const tenantId = req.tenant.id;
        const correlationId = req.requestId || req.headers['x-request-id'] || crypto.randomUUID();
        const result = await reactivateWithPayPalUseCase({
            tenantId,
            userId: null,
            subscriptionId,
            correlationId
        });
        return sendUseCaseResult(res, result, {
            successPayloadResolver: () => ({
                success: true,
                message: result.data?.message || 'Account reactivated successfully.',
                data: result.data
            })
        });
    } catch (error) {
        logger.error('Reactivate With PayPal Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export default {
    handleWebhook,
    simulateWebhook,
    cancelSubscription,
    getBillingHistory,
    syncWithPayPal,
    upgradeToPremium,
    migrateToPayPal,
    changePlan,
    getPendingPlan,
    requestReactivation,
    reactivateWithPayPal
};
