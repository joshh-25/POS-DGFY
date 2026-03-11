import express from 'express';
import {
    handleWebhook,
    simulateWebhook,
    upgradeToPremium,
    cancelSubscription,
    getBillingHistory,
    syncWithPayPal,
    migrateToPayPal,
    changePlan,
    getPendingPlan,
    requestReactivation,
    reactivateWithPayPal
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * Public Webhook endpoint for PayPal
 */
router.post('/webhook', handleWebhook);

/**
 * Public endpoint for inactive tenants to request reactivation.
 * No JWT — tenant is identified via x-company-token header (tenantHandler).
 */
router.post('/request-reactivation', requestReactivation);

/**
 * Public endpoint for inactive tenants to self-reactivate via PayPal.
 * No JWT — tenant identified via x-company-token header (tenantHandler).
 */
router.post('/reactivate-with-paypal', reactivateWithPayPal);

/**
 * Private Payments endpoints
 */
router.post('/upgrade', authenticate, upgradeToPremium);
router.post('/cancel', authenticate, cancelSubscription);
router.get('/history', authenticate, getBillingHistory);
router.post('/sync', authenticate, syncWithPayPal);
router.post('/migrate-to-paypal', authenticate, migrateToPayPal);
router.post('/change-plan', authenticate, changePlan);
router.get('/pending-plan', authenticate, getPendingPlan);

/**
 * Dev-only simulation endpoint
 */
if (process.env.NODE_ENV !== 'production') {
    router.post('/simulate-webhook', simulateWebhook);
}

export default router;
