
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

import dbStore from '../src/utils/dbStore.js';
import * as billingScheduler from '../src/schedulers/billingScheduler.js';
import { Op } from 'sequelize';

const runTest = async () => {
    console.log('--- STARTING BILLING SCHEDULER TEST ---');

    // 1. Setup a tenant that expires in 7 days
    const Tenant = dbStore.get('Tenant');
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await Tenant.findOrCreate({
        where: { name: 'Billing Test Co' },
        defaults: {
            id: 'test-billing-uuid',
            domain: 'billing-test',
            db_name: 'sku_tenant_billing_test',
            company_token: 'token-billing-test',
            status: 'active',
            admin_email: 'billing-test@example.com',
            admin_password_hash: 'hash',
            plan: 'premium',
            subscription_status: 'active',
            current_period_end: futureDate
        }
    });

    await Tenant.update({
        plan: 'premium',
        subscription_status: 'active',
        current_period_end: futureDate
    }, { where: { name: 'Billing Test Co' } });
    console.log('Updated test tenant Billing Test Co to expire in 7 days.');

    // 2. Setup a tenant already expired
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await Tenant.findOrCreate({
        where: { name: 'Expired Co' },
        defaults: {
            id: 'expired-billing-uuid',
            domain: 'expired-test',
            db_name: 'sku_tenant_expired_test',
            company_token: 'token-expired-test',
            status: 'active',
            admin_email: 'expired@example.com',
            admin_password_hash: 'hash',
            plan: 'premium',
            subscription_status: 'active',
            current_period_end: expiredDate
        }
    });

    await Tenant.update({
        plan: 'premium',
        subscription_status: 'active',
        current_period_end: expiredDate,
        grace_period_end: null
    }, { where: { name: 'Expired Co' } });
    console.log('Updated test tenant Expired Co as expired (reset grace period).');

    // 3. Trigger Scheduler Logic (Manual bypass of cron)
    console.log('\nRunning scheduler logic...');

    await billingScheduler.checkExpiringSubscriptions();
    await billingScheduler.checkExpiredSubscriptions();

    // 4. Verify results
    const updatedExpired = await Tenant.findOne({ where: { name: 'Expired Co' } });
    if (updatedExpired && updatedExpired.subscription_status === 'past_due' && updatedExpired.grace_period_end) {
        console.log('SUCCESS: Expired Co entered 3-day grace period.');
    } else {
        console.error('FAILURE: Expired Co did NOT enter grace period.');
        console.log('Current Plan:', updatedExpired?.plan);
        console.log('Current Status:', updatedExpired?.subscription_status);
        console.log('Grace End:', updatedExpired?.grace_period_end);
    }

    console.log('--- TEST FINISHED ---');
    process.exit(0);
};

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
