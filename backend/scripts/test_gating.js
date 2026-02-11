
import request from 'supertest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

const logFile = 'test_result_final.log';
// Clear log if exists
fs.writeFileSync(logFile, '--- STARTING GATING TEST LOG ---\n');

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

// Configure Environment at process level BEFORE importing app
process.env.MOCK_PAYPAL = 'true';
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'SKU';

const runTest = async () => {
    log('--- STARTING GATING TEST (SUPERTEST) ---');

    log('Importing App...');
    let app;
    try {
        const serverModule = await import('../src/server.js');
        app = serverModule.default;
    } catch (err) {
        log('Failed to import server: ' + err.message);
        process.exit(1);
    }

    try {
        // 1. Register STANDARD Company
        const standardEmail = `std_${Date.now()}@test.com`;
        log(`\n1. Registering STANDARD company (${standardEmail})...`);
        const stdReg = await request(app)
            .post('/api/v1/admin/tenants/register')
            .send({
                name: `Std Co ${Date.now()}`,
                adminEmail: standardEmail,
                adminPassword: 'Password123!',
                plan: 'standard'
            });

        if (stdReg.status !== 201) {
            log('   [FAIL] Standard Registration failed. Status: ' + stdReg.status);
            log('   Body: ' + JSON.stringify(stdReg.body));
            process.exit(1);
        }
        const stdCompanyToken = stdReg.body.data.company_token;
        log('   -> Standard Registered. Status: ' + stdReg.status);

        // 2. Register PREMIUM Company (Mocked)
        const premiumEmail = `prem_${Date.now()}@test.com`;
        log(`\n2. Registering PREMIUM company (${premiumEmail})...`);
        const premReg = await request(app)
            .post('/api/v1/admin/tenants/register')
            .send({
                name: `Prem Co ${Date.now()}`,
                adminEmail: premiumEmail,
                adminPassword: 'Password123!',
                plan: 'premium',
                subscriptionId: 'SUB-MOCK-12345'
            });

        if (premReg.status !== 201) {
            log('   [FAIL] Premium Registration failed. Status: ' + premReg.status);
            log('   Body: ' + JSON.stringify(premReg.body));
            process.exit(1);
        }
        const premCompanyToken = premReg.body.data.company_token;
        log('   -> Premium Registered. Status: ' + premReg.status);

        // 3. Login PREMIUM to get Token
        log('   Logging in Premium Admin...');
        const premLoginRes = await request(app)
            .post('/api/v1/auth/login')
            .set('x-company-token', premCompanyToken) // Use header instead of body
            .send({
                email: premiumEmail,
                password: 'Password123!'
            });

        if (premLoginRes.status !== 200) {
            log('   [FAIL] Premium login failed. Status: ' + premLoginRes.status);
            log('   Body: ' + JSON.stringify(premLoginRes.body));
            process.exit(1);
        }
        const premToken = premLoginRes.body.data.token;
        log('   -> Premium Logged In. OK');

        // 4. Test AI Chat as STANDARD (Should Fail 403 or 404)
        log(`\n4. Testing AI Chat as STANDARD User...`);
        const stdAiRes = await request(app)
            .post('/api/v1/ai/chat')
            .set('x-company-token', stdCompanyToken)
            .send({ message: 'Hello' });

        if (stdAiRes.status === 403 || stdAiRes.status === 404 || stdAiRes.status === 401) {
            log(`   [PASS] Standard user gated. Status: ${stdAiRes.status} (${stdAiRes.body.message})`);
        } else {
            log('   [FAIL] Standard user NOT blocked. Status: ' + stdAiRes.status);
            log('   Body: ' + JSON.stringify(stdAiRes.body));
        }

        // 5. Test AI Chat as PREMIUM (Should NOT be 403)
        log(`\n5. Testing AI Chat as PREMIUM User...`);
        const premAiRes = await request(app)
            .post('/api/v1/ai/chat')
            .set('Authorization', `Bearer ${premToken}`)
            .set('x-company-token', premCompanyToken)
            .send({ message: 'Hello' });

        if (premAiRes.status === 403) {
            log('   [FAIL] Premium user was BLOCKED (403)');
            log('   Message: ' + premAiRes.body.message);
        } else if (premAiRes.status === 401) {
            log('   [FAIL] Premium user UNAUTHORIZED (401)');
        } else {
            // Success (200, 500, etc. all mean they passed the gating middleware)
            log('   [PASS] Premium user passed gating. Status: ' + premAiRes.status);
        }

    } catch (error) {
        log('TEST FAILED: ' + error.message);
    }

    log('\n--- GATING TEST COMPLETE ---');
    process.exit(0);
};

runTest();
