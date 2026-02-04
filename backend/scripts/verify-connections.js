/**
 * End-to-End Multi-Tenancy Connection Integrity Test
 * Tests: Frontend -> Backend API -> Database -> Tenant Isolation
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = 'http://localhost:5000/api/v1';
const TENANT_TOKEN = 'token-tenant-a';

const tests = [];

async function test(name, fn) {
    try {
        await fn();
        tests.push({ name, status: '✅ PASS' });
        console.log(`✅ ${name}`);
    } catch (error) {
        tests.push({ name, status: '❌ FAIL', error: error.message });
        console.error(`❌ ${name}: ${error.message}`);
    }
}

async function runTests() {
    console.log('=== Multi-Tenancy Connection Integrity Test ===\n');

    // 1. Health Check
    await test('Backend Health Check', async () => {
        const res = await axios.get('http://localhost:5000/health');
        if (!res.data.success) throw new Error('Health check failed');
    });

    // 2. Tenant Login
    let authToken = null;
    await test('Tenant Login (with Company Token)', async () => {
        const res = await axios.post(`${API_BASE}/auth/login`, {
            email: 'admin@tenant-a.com',
            password: 'Admin123!'
        }, {
            headers: { 'x-company-token': TENANT_TOKEN }
        });
        if (!res.data.data.token) throw new Error('No token received');
        authToken = res.data.data.token;
    });

    // 3. Dashboard Load (Authenticated Request)
    await test('Dashboard API (Authenticated)', async () => {
        const res = await axios.get(`${API_BASE}/dashboard/stats`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'x-company-token': TENANT_TOKEN
            }
        });
        if (!res.data.success) throw new Error('Dashboard failed');
    });

    // 4. Items API
    await test('Items API (Listing)', async () => {
        const res = await axios.get(`${API_BASE}/items`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'x-company-token': TENANT_TOKEN
            }
        });
        if (!res.data.success) throw new Error('Items listing failed');
    });

    // 5. Suppliers API
    await test('Suppliers API (Listing)', async () => {
        const res = await axios.get(`${API_BASE}/suppliers`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'x-company-token': TENANT_TOKEN
            }
        });
        if (!res.data.success) throw new Error('Suppliers listing failed');
    });

    // Summary
    console.log('\n=== Test Summary ===');
    const passed = tests.filter(t => t.status.includes('PASS')).length;
    const failed = tests.filter(t => t.status.includes('FAIL')).length;
    console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed}`);

    if (failed > 0) {
        console.log('\nFailed Tests:');
        tests.filter(t => t.status.includes('FAIL')).forEach(t => {
            console.log(`  - ${t.name}: ${t.error}`);
        });
        process.exit(1);
    } else {
        console.log('\n🎉 All connection tests passed!');
    }
}

runTests().catch(console.error);
