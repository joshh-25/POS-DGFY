import express from 'express';
import {
    handleWebhook,
    simulateWebhook,
    upgradeToPremium,
    cancelSubscription,
    getBillingHistory,
    syncWithPayPal
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * Public Webhook endpoint for PayPal
 */
router.post('/webhook', handleWebhook);

/**
 * Private Payments endpoints
 */
router.post('/upgrade', authenticate, upgradeToPremium);
router.post('/cancel', authenticate, cancelSubscription);
router.get('/history', authenticate, getBillingHistory);
router.post('/sync', authenticate, syncWithPayPal);

/**
 * Dev-only simulation endpoint
 */
if (process.env.NODE_ENV !== 'production') {
    router.post('/simulate-webhook', simulateWebhook);
}

export default router;
