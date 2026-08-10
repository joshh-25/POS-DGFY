
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Op } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

import dbStore from '../src/utils/dbStore.js';
import * as billingScheduler from '../src/schedulers/billingScheduler.js';

const runTest = async () => {
    console.log('--- STARTING SCHEDULER IDEMPOTENCY TEST ---');

    const Tenant = dbStore.get('Tenant');

    // 1. Create a tenant expiring in 7 days
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const tenantName = 'Idempotency Test Co';

    let [tenant, created] = await Tenant.findOrCreate({
        where: { name: tenantName },
        defaults: {
            id: 'idempotency-test-uuid',
            domain: 'idempotency-test',
            db_name: 'sku_tenant_idempotency_test',
            company_token: 'token-idempotency-test',
            status: 'active',
            admin_email: 'idempotency@example.com',
            plan: 'premium',
            subscription_status: 'active',
            current_period_end: futureDate,
            last_expiry_notified_at: null,
            last_expiry_notification_type: null
        }
    });

    // Ensure state is clean
    await tenant.update({
        plan: 'premium',
        subscription_status: 'active',
        current_period_end: futureDate,
        last_expiry_notified_at: null,
        last_expiry_notification_type: null
    });

    console.log(`[SETUP] Tenant "${tenantName}" ready. last_expiry_notified_at: null`);

    // 2. Run Scheduler Logic FIRST PASS
    console.log('\n[STEP 1] Running scheduler (Pass 1)...');
    await billingScheduler.checkExpiringSubscriptions();

    // 3. Verify it was processed
    await tenant.reload();
    const firstRunTime = tenant.last_expiry_notified_at;
    const firstRunType = tenant.last_expiry_notification_type;

    if (!firstRunTime) {
        console.error('FAILURE: Tenant was NOT processed in Pass 1.');
        process.exit(1);
    }
    console.log(`[PASS 1] Success. Email sent at: ${firstRunTime.toISOString()}, Type: ${firstRunType}`);

    // Validate type
    if (firstRunType !== '7-day') {
        console.warn(`WARNING: Expected '7-day', got '${firstRunType}'`);
    }

    // 4. Wait a bit (to ensure timestamp would change if updated)
    console.log('\n[STEP 2] Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 5. Run Scheduler Logic SECOND PASS
    console.log('[STEP 3] Running scheduler (Pass 2)...');
    await billingScheduler.checkExpiringSubscriptions();

    // 6. Verify IDEMPOTENCY
    await tenant.reload();
    const secondRunTime = tenant.last_expiry_notified_at;

    console.log(`[PASS 2] last_expiry_notified_at: ${secondRunTime.toISOString()}`);

    if (secondRunTime.getTime() === firstRunTime.getTime()) {
        console.log('\nSUCCESS: Timestamp did NOT change. Scheduler is Idempotent.');
        process.exit(0);
    } else {
        console.error('\nFAILURE: Timestamp CHANGED. Scheduler re-sent the email!');
        process.exit(1);
    }
};

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
