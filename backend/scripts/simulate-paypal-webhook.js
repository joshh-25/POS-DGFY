import axios from 'axios';
import dotenv from 'dotenv';
import db from '../src/models/index.js';

dotenv.config();

const { Tenant } = db;
const API_URL = 'http://localhost:5000/api/v1/payments/webhook';

async function simulateWebhook() {
    // 1. Get a test tenant
    const tenant = await Tenant.findOne();
    if (!tenant) {
        console.error('❌ No tenant found to test with.');
        process.exit(1);
    }

    console.log(`✅ Using Tenant: ${tenant.name} (${tenant.id})`);

    // 2. Prepare Mock Payload
    const subscriptionId = tenant.paypal_subscription_id || 'MOCK_SUB_' + Date.now();

    // Ensure tenant has a mock subscription ID if missing
    if (!tenant.paypal_subscription_id) {
        console.log('ℹ️ Tenant has no subscription ID. Assigning one temporarilly...');
        await tenant.update({ paypal_subscription_id: subscriptionId });
    }

    const payload = {
        id: 'WH-' + Date.now(),
        event_version: '1.0',
        create_time: new Date().toISOString(),
        resource_type: 'sale',
        event_type: 'PAYMENT.SALE.COMPLETED',
        summary: 'Payment completed for $29.99 USD',
        resource: {
            id: 'TXN-' + Date.now(),
            billing_agreement_id: subscriptionId,
            amount: {
                total: '29.99',
                currency: 'USD'
            },
            payment_mode: 'INSTANT_TRANSFER',
            create_time: new Date().toISOString(),
            update_time: new Date().toISOString(),
            state: 'completed'
        }
    };

    // 3. Send Webhook
    try {
        console.log('🚀 Sending Mock Webhook:', payload.event_type);

        const headers = {
            'paypal-transmission-id': 'mock-trans-' + Date.now(),
            'paypal-transmission-time': new Date().toISOString(),
            'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-MOCK',
            'paypal-auth-algo': 'SHA256withRSA',
            'paypal-transmission-sig': 'MOCK_SIGNATURE',
            'Content-Type': 'application/json'
        };

        const response = await axios.post(API_URL, payload, { headers });
        console.log('✅ Response:', response.data);
    } catch (error) {
        console.error('❌ Error sending webhook:', error.response?.data || error.message);
    } finally {
        process.exit();
    }
}

simulateWebhook();
