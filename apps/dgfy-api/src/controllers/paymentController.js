/**
 * Payment Controller (Compatibility Facade)
 */

export {
    handleWebhook,
    simulateWebhook,
    cancelSubscription,
    cancelPayMongoSubscription,
    getBillingHistory,
    syncWithPayPal,
    syncWithPayMongo,
    upgradeToPremium,
    migrateToPayPal,
    migrateToPayMongo,
    changePlan,
    changePayMongoPlan,
    setupPayMongoRecurring,
    getPendingPlan,
    requestReactivation,
    reactivateWithPayPal,
    reactivateWithPayMongo
} from '../modules/payments/controllers/paymentHandlers.js';

import {
    handleWebhook,
    simulateWebhook,
    cancelSubscription,
    cancelPayMongoSubscription,
    getBillingHistory,
    syncWithPayPal,
    syncWithPayMongo,
    upgradeToPremium,
    migrateToPayPal,
    migrateToPayMongo,
    changePlan,
    changePayMongoPlan,
    setupPayMongoRecurring,
    getPendingPlan,
    requestReactivation,
    reactivateWithPayPal,
    reactivateWithPayMongo
} from '../modules/payments/controllers/paymentHandlers.js';

export default {
    handleWebhook,
    simulateWebhook,
    cancelSubscription,
    cancelPayMongoSubscription,
    getBillingHistory,
    syncWithPayPal,
    syncWithPayMongo,
    upgradeToPremium,
    migrateToPayPal,
    migrateToPayMongo,
    changePlan,
    changePayMongoPlan,
    setupPayMongoRecurring,
    getPendingPlan,
    requestReactivation,
    reactivateWithPayPal,
    reactivateWithPayMongo
};
