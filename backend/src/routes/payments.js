import express from 'express';
import {
    handleWebhook,
    simulateWebhook,
    upgradeToPremium,
    cancelSubscription,
    cancelPayMongoSubscription,
    getBillingHistory,
    syncWithPayPal,
    syncWithPayMongo,
    migrateToPayPal,
    migrateToPayMongo,
    changePlan,
    changePayMongoPlan,
    setupPayMongoRecurring,
    getPendingPlan,
    requestReactivation,
    reactivateWithPayPal,
    reactivateWithPayMongo
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePaymentCapabilityCompliance } from '../middleware/compliancePolicy.js';
import { paymentsEnabled, paymentsDisabledMessage } from '../config/paymentsFeature.js';

const router = express.Router();

router.use((req, res, next) => {
    if (paymentsEnabled) return next();
    return res.status(503).json({
        success: false,
        message: paymentsDisabledMessage,
        code: 'PAYMENTS_DISABLED'
    });
});

/**
 * Public Webhook endpoint for PayPal
 */
router.post('/webhook', handleWebhook);

/**
 * Public endpoint for inactive tenants to request reactivation.
 * No JWT — tenant is identified via x-company-token header (tenantHandler).
 */
router.post('/request-reactivation', requirePaymentCapabilityCompliance, requestReactivation);

/**
 * Public endpoint for inactive tenants to self-reactivate via PayPal.
 * No JWT — tenant identified via x-company-token header (tenantHandler).
 */
router.post('/reactivate-with-paypal', requirePaymentCapabilityCompliance, reactivateWithPayPal);
router.post('/reactivate-with-paymongo', requirePaymentCapabilityCompliance, reactivateWithPayMongo);

/**
 * Private Payments endpoints
 */
router.post('/upgrade', authenticate, requirePaymentCapabilityCompliance, upgradeToPremium);
router.post('/cancel', authenticate, cancelSubscription);
router.get('/history', authenticate, getBillingHistory);
router.post('/sync', authenticate, requirePaymentCapabilityCompliance, syncWithPayPal);
router.post('/sync-paymongo', authenticate, requirePaymentCapabilityCompliance, syncWithPayMongo);
router.post('/migrate-to-paypal', authenticate, requirePaymentCapabilityCompliance, migrateToPayPal);
router.post('/migrate-to-paymongo', authenticate, requirePaymentCapabilityCompliance, migrateToPayMongo);
router.post('/change-plan', authenticate, requirePaymentCapabilityCompliance, changePlan);
router.post('/change-paymongo-plan', authenticate, requirePaymentCapabilityCompliance, changePayMongoPlan);
router.post('/setup-paymongo-recurring', authenticate, requirePaymentCapabilityCompliance, setupPayMongoRecurring);
router.post('/cancel-paymongo', authenticate, cancelPayMongoSubscription);
router.get('/pending-plan', authenticate, getPendingPlan);

/**
 * Dev-only simulation endpoint
 */
if (process.env.NODE_ENV !== 'production') {
    router.post('/simulate-webhook', simulateWebhook);
}

export default router;
