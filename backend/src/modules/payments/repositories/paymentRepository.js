import { Op } from 'sequelize';
import db from '../../../models/index.js';
import { assertPaymentRepositoryContract } from '../contracts/paymentRepository.contract.js';

const { Tenant, Payment, WebhookLog } = db;

export const paymentRepository = {
    findTenantBySubscriptionId(subscriptionId) {
        return Tenant.findOne({
            where: {
                [Op.or]: [
                    { paypal_subscription_id: subscriptionId },
                    { paymongo_subscription_id: subscriptionId }
                ]
            }
        });
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
    },
    // ── Subscription lifecycle queries ─────────────────────────────────────────
    findTenantByPendingSubscriptionId(subscriptionId) {
        return Tenant.findOne({
            where: {
                [Op.or]: [
                    { pending_paypal_subscription_id: subscriptionId },
                    { pending_paymongo_subscription_id: subscriptionId }
                ]
            }
        });
    },
    findTenantsByPendingPayPalSetup(cutoffDate) {
        return Tenant.findAll({
            where: {
                [Op.or]: [
                    {
                        pending_paypal_subscription_id: { [Op.ne]: null },
                        paypal_setup_initiated_at: { [Op.lt]: cutoffDate }
                    },
                    {
                        pending_paymongo_subscription_id: { [Op.ne]: null },
                        paymongo_setup_initiated_at: { [Op.lt]: cutoffDate }
                    }
                ]
            }
        });
    },
    findTenantsByDeferredPlanChange(now) {
        return Tenant.findAll({
            where: {
                pending_plan: { [Op.ne]: null },
                pending_plan_change_date: { [Op.lte]: now },
                payment_method: 'manual'
            }
        });
    },
    findTenantsByExpiredRevisions(cutoffDate) {
        return Tenant.findAll({
            where: {
                pending_plan: { [Op.ne]: null },
                pending_plan_approved: false,
                pending_plan_change_date: { [Op.lt]: cutoffDate }
            }
        });
    },
    findCancelledExpiredTenants(now) {
        return Tenant.findAll({
            where: {
                subscription_status: 'cancelled',
                current_period_end: { [Op.lt]: now },
                status: 'active'
            }
        });
    }
};

assertPaymentRepositoryContract(paymentRepository);
