import cron from 'node-cron';
import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import * as emailService from '../services/emailService.js';
import logger from '../config/logger.js';

/**
 * Initialize billing scheduler
 * Runs daily at midnight
 */
export const initBillingScheduler = () => {
    // Run at 00:00 every day
    cron.schedule('0 0 * * *', async () => {
        logger.info('Running daily billing check...');
        try {
            await checkExpiringSubscriptions();
            await checkExpiredSubscriptions();
        } catch (error) {
            logger.error('Billing scheduler error:', error);
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

                await emailService.sendSubscriptionExpiringEmail({
                    email: tenant.admin_email,
                    companyName: tenant.name,
                    expiryDate: tenant.current_period_end
                });

                // Mark as notified
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

export default {
    initBillingScheduler
};
