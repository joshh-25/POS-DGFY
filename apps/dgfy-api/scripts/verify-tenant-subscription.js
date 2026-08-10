import db from '../src/models/index.js';

const { Tenant } = db;
const TENANT_ID = '24796542-3f8d-4df2-8cb7-ce422aa5ced5'; // ID from your logs

async function checkStatus() {
    try {
        const tenant = await Tenant.findByPk(TENANT_ID);
        if (!tenant) {
            console.log('❌ Tenant not found.');
            return;
        }

        console.log('--- Tenant Subscription Status ---');
        console.log(`Name: ${tenant.name}`);
        console.log(`ID: ${tenant.id}`);
        console.log(`Status: ${tenant.subscription_status}`);
        console.log(`Plan: ${tenant.plan}`);
        console.log(`Expires At: ${tenant.current_period_end}`);
        console.log('----------------------------------');

        if (tenant.subscription_status === 'active') {
            console.log('✅ SUCCESS: Subscription is active!');
        } else {
            console.log('⚠️ Subscription is NOT active yet.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

checkStatus();
