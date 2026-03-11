import cron from 'node-cron';
import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import * as emailService from '../services/emailService.js';
import cacheService from '../services/cacheService.js'; // Fix 8.2: Import cache service for locking
import logger from '../config/logger.js';
import { paymentRepository } from '../modules/payments/repositories/paymentRepository.js';

/**
 * Initialize billing scheduler
 * Runs daily at midnight
 */
export const initBillingScheduler = () => {
    // Run at 00:00 every day
    cron.schedule('0 0 * * *', async () => {
        logger.info('Running daily billing check...');

        // Fix 8.2: Distributed Lock to prevent duplicate execution in clustered environments
        // Lock for 1 hour (3600s) to cover worst-case execution time
        const LOCK_KEY = 'scheduler:billing:daily_check';
        const acquired = await cacheService.acquireLock(LOCK_KEY, 3600);

        if (!acquired) {
            logger.warn('Billing scheduler lock held by another instance. Skipping execution.');
            return;
        }

        try {
            await checkExpiringSubscriptions();
            await checkExpiredSubscriptions();
            await applyDeferredPlanChanges();
            await expirePayPalSetups();
            await expireUnapprovedRevisions();
            await deactivateCancelledTenants();
        } catch (error) {
            logger.error('Billing scheduler error:', error);
        } finally {
            // Validate that we should release the lock?
            // Usually we release to allow re-runs, but since this is daily, 
            // keeping it locked until TTL implies "only run once per day interval" if we don't release? 
            // No, TTL is for crash recovery. We should release when done so manual triggers works or just good citizenship.
            await cacheService.releaseLock(LOCK_KEY);
        }
    });

    logger.info('Billing scheduler initialized');
};

/**
 * Check for subscriptions expiring in 7 days or 1 day
 */
export const checkExpiringSubscriptions = async () => {
    const Tenant = dbStore.get('Tenant');
    const now = new Date();
    const BATCH_SIZE = 50;

    const ranges = [
        { days: 7, label: '7-day' },
        { days: 1, label: '1-day' }
    ];

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    for (const range of ranges) {
        const targetDate = new Date(now);
        targetDate.setDate(now.getDate() + range.days);

        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);

        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);

        let hasMore = true;

        while (hasMore) {
            const expiring = await Tenant.findAll({
                where: {
                    plan: 'premium',
                    subscription_status: 'active',
                    current_period_end: { [Op.between]: [start, end] },
                    // Idempotency check: Don't send if already sent today for this range
                    [Op.or]: [
                        { last_expiry_notified_at: null },
                        { last_expiry_notified_at: { [Op.lt]: startOfToday } },
                        { last_expiry_notification_type: { [Op.ne]: range.label } }
                    ]
                },
                limit: BATCH_SIZE,
                offset: 0 // Always 0 because we update the record and it stops matching the filter
            });

            if (expiring.length === 0) {
                hasMore = false;
                break;
            }

            for (const tenant of expiring) {
                logger.info(`Sending ${range.label} expiry warning to ${tenant.name}`);

                if (emailService.isEmailConfigured()) {
                    await emailService.sendSubscriptionExpiringEmail({
                        email: tenant.admin_email,
                        companyName: tenant.name,
                        expiryDate: tenant.current_period_end
                    }).catch(err => logger.warn('Email failed (expiry warning):', err.message));
                }

                // Mark as notified regardless of email success to prevent re-sending
                await tenant.update({
                    last_expiry_notified_at: new Date(),
                    last_expiry_notification_type: range.label
                });
            }

            if (expiring.length < BATCH_SIZE) hasMore = false;
        }
    }
};

/**
 * Check for subscriptions that have passed their end date
 * Implements a 3-day Grace Period
 */
export const checkExpiredSubscriptions = async () => {
    const Tenant = dbStore.get('Tenant');
    const now = new Date();
    const BATCH_SIZE = 50;

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const expired = await Tenant.findAll({
            where: {
                plan: 'premium',
                current_period_end: { [Op.lt]: now },
                // Use explicit OR to ensure processed records stop matching, 
                // allowing us to use offset 0 safely and avoid skipping.
                [Op.or]: [
                    { subscription_status: 'active' },
                    {
                        subscription_status: 'past_due',
                        grace_period_end: { [Op.lt]: now }
                    }
                ]
            },
            limit: BATCH_SIZE,
            offset: 0 // Always 0 because processed records move out of the filter
        });

        if (expired.length === 0) {
            hasMore = false;
            break;
        }

        for (const tenant of expired) {
            // Logic: Grace Period vs Hard Downgrade
            if (!tenant.grace_period_end) {
                // First time detecting failure - start grace period
                const graceEnd = new Date(now);
                graceEnd.setDate(now.getDate() + 3);
                logger.info(`Tenant ${tenant.name} entering 3-day grace period until ${graceEnd}`);

                await tenant.update({
                    subscription_status: 'past_due',
                    grace_period_end: graceEnd
                });

                await emailService.sendPaymentFailedGracePeriodEmail({
                    email: tenant.admin_email,
                    companyName: tenant.name,
                    gracePeriodEnd: graceEnd
                });
            }
            else if (tenant.grace_period_end < now) {
                // Grace period expired - HARD DOWNGRADE
                logger.info(`Grace period expired for ${tenant.name}. Downgrading.`);

                await tenant.update({
                    plan: 'standard',
                    subscription_status: 'inactive',
                    grace_period_end: null
                });

                await emailService.sendSubscriptionCancelledEmail({
                    email: tenant.admin_email,
                    companyName: tenant.name,
                    downgradeDate: now
                });
            }
        }

        if (expired.length < BATCH_SIZE) hasMore = false;
    }
};

/**
 * Apply deferred plan changes for manually-billed tenants.
 * Runs when pending_plan_change_date <= now and payment_method = 'manual'.
 */
export const applyDeferredPlanChanges = async () => {
    const now = new Date();
    const tenants = await paymentRepository.findTenantsByDeferredPlanChange(now);

    for (const tenant of tenants) {
        const oldPlan = tenant.plan;
        const newPlan = tenant.pending_plan;
        logger.info(`Applying deferred plan change for ${tenant.name}: ${oldPlan} → ${newPlan}`);

        await tenant.update({
            plan: newPlan,
            pending_plan: null,
            pending_plan_change_date: null,
            pending_plan_approved: false
        });

        if (emailService.isEmailConfigured()) {
            await emailService.sendPlanChangeAppliedEmail({
                email: tenant.admin_email,
                companyName: tenant.name,
                oldPlan,
                newPlan
            }).catch(err => logger.warn('Email failed (deferred plan change):', err.message));
        }
    }
};

/**
 * Expire admin-initiated PayPal setup links after 72 hours.
 */
export const expirePayPalSetups = async () => {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const tenants = await paymentRepository.findTenantsByPendingPayPalSetup(cutoff);

    for (const tenant of tenants) {
        logger.info(`PayPal setup link expired for ${tenant.name}. Clearing pending setup.`);

        await tenant.update({
            pending_paypal_subscription_id: null,
            paypal_setup_initiated_at: null
        });

        // Notify the platform admin
        const adminEmail = process.env.PLATFORM_ADMIN_EMAIL || process.env.SMTP_USER;
        if (adminEmail && emailService.isEmailConfigured()) {
            await emailService.sendPayPalSetupExpiredEmail({
                email: adminEmail,
                companyName: tenant.name
            }).catch(err => logger.warn('Email failed (paypal setup expired):', err.message));
        }
    }
};

/**
 * Expire unapproved PayPal plan revisions after 72 hours.
 * If the user never re-consented on PayPal, the pending change is cancelled.
 */
export const expireUnapprovedRevisions = async () => {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const tenants = await paymentRepository.findTenantsByExpiredRevisions(cutoff);

    for (const tenant of tenants) {
        logger.info(`Unapproved plan revision expired for ${tenant.name}. Clearing pending plan.`);

        await tenant.update({
            pending_plan: null,
            pending_plan_change_date: null,
            pending_plan_approved: false
        });
    }
};

/**
 * Deactivate cancelled tenants whose current_period_end has passed.
 */
export const deactivateCancelledTenants = async () => {
    const now = new Date();
    const tenants = await paymentRepository.findCancelledExpiredTenants(now);

    for (const tenant of tenants) {
        logger.info(`Deactivating cancelled tenant ${tenant.name} (period ended ${tenant.current_period_end}).`);

        await tenant.update({ status: 'inactive' });

        if (emailService.isEmailConfigured()) {
            await emailService.sendSubscriptionCancelledEmail({
                email: tenant.admin_email,
                companyName: tenant.name,
                downgradeDate: new Date()
            }).catch(err => logger.warn('Email failed (tenant deactivated):', err.message));
        }
    }
};

export default {
    initBillingScheduler
};
