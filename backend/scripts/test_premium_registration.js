
import request from 'supertest';

process.env.MOCK_PAYPAL = 'true';
process.env.NODE_ENV = 'test';

const runTest = async () => {
    console.log('--- Starting Premium Registration Test (Final) ---');

    console.log('Importing Server...');
    let app;
    try {
        const serverModule = await import('../src/server.js');
        app = serverModule.default;
        if (!app) {
            throw new Error('Server module does not export default app');
        }
        console.log('✅ Server Imported Successfully');
    } catch (err) {
        console.error('❌ FATAL: Failed to import server.js', err);
        process.exit(1);
    }

    // Randomize name
    const uniqueName = 'TestCorp_Final_' + Math.floor(Math.random() * 10000);
    const adminEmail = `admin_final_${Math.floor(Math.random() * 10000)}@test.com`;

    console.log(`Sending Registration Request for: ${uniqueName}`);

    try {
        const res = await request(app)
            .post('/api/v1/admin/tenants/register')
            .send({
                name: uniqueName,
                adminEmail: adminEmail,
                adminPassword: 'Password123!',
                plan: 'premium',
                subscriptionId: 'sub_mock_123'
            });

        console.log('Response Status:', res.status);

        // Log clean body
        try {
            console.log('Response Body:', JSON.stringify(res.body, null, 2));
        } catch (e) {
            console.log('Response Body (Simpler):', res.body);
        }

        if (res.status === 201 && res.body.data?.status === 'active') {
            console.log('✅ TEST PASSED: Premium Tenant Created and Activated via Mock.');
        } else {
            console.error('❌ TEST FAILED: Unexpected response.');
        }

    } catch (error) {
        console.error('❌ TEST FAILED: Exception', error);
    }

    process.exit(0);
};

runTest();
