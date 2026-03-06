import db from '../../../models/index.js';
import { assertPaymentRepositoryContract } from '../contracts/paymentRepository.contract.js';

const { Tenant, Payment, WebhookLog } = db;

export const paymentRepository = {
    findTenantBySubscriptionId(subscriptionId) {
        return Tenant.findOne({ where: { paypal_subscription_id: subscriptionId } });
    },
    findTenantById(tenantId) {
        return Tenant.findByPk(tenantId);
    },
    createPayment(payload, options = {}) {
        return Payment.create(payload, options);
    },
    findPaymentsByTenantId(tenantId) {
        return Payment.findAll({
            where: { tenant_id: tenantId },
            order: [['createdAt', 'DESC']]
        });
    },
    findWebhookLog(webhookId) {
        return WebhookLog.findOne({ where: { webhook_id: webhookId } });
    },
    findOrCreateWebhookLog(webhookId, defaults) {
        return WebhookLog.findOrCreate({
            where: { webhook_id: webhookId },
            defaults
        });
    },
    runInTransaction(callback) {
        return db.sequelize.transaction(callback);
    }
};

assertPaymentRepositoryContract(paymentRepository);
