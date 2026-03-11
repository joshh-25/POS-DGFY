/**
 * Payment Controller (Compatibility Facade)
 */

export {
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
} from '../modules/payments/controllers/paymentHandlers.js';

import {
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
} from '../modules/payments/controllers/paymentHandlers.js';

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
