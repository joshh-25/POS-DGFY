/**
 * Payment repository contract for landlord billing persistence.
 *
 * Expected shape:
 * - findTenantBySubscriptionId(subscriptionId)
 * - findTenantById(tenantId)
 * - createPayment(payload, options)
 * - findPaymentsByTenantId(tenantId)
 * - findWebhookLog(webhookId)
 * - findOrCreateWebhookLog(webhookId, defaults)
 * - runInTransaction(callback)
 */
export const PaymentRepositoryContract = Object.freeze([
    'findTenantBySubscriptionId',
    'findTenantById',
    'createPayment',
    'findPaymentsByTenantId',
    'findWebhookLog',
    'findOrCreateWebhookLog',
    'runInTransaction',
    'findTenantByPendingSubscriptionId',
    'findTenantsByPendingPayPalSetup',
    'findTenantsByDeferredPlanChange',
    'findTenantsByExpiredRevisions',
    'findCancelledExpiredTenants'
]);

export const assertPaymentRepositoryContract = (repository) => {
    PaymentRepositoryContract.forEach((method) => {
        if (typeof repository?.[method] !== 'function') {
            throw new Error(`PaymentRepository missing required method: ${method}`);
        }
    });
};
