import axios from 'axios';
import fs from 'fs';

// Log to file to avoid console truncation issues
const logFile = './tests/verify_log.txt';
const log = (msg) => {
    console.log(msg);
    try {
        fs.appendFileSync(logFile, msg + '\n');
    } catch (e) {
        console.error('Failed to write to log file:', e);
    }
};

const API_URL = 'http://127.0.0.1:5000/api/v1';

async function runTest() {
    try {
        fs.writeFileSync(logFile, ''); // Clear log
    } catch (e) {
        console.error('Failed to clear log file:', e);
    }

    try {
        log('1. Logging in as Admin...');
        const loginRes = await axios.post(`${API_URL}/admin/login`, {
            username: 'skupervisor',
            password: '252378'
        });

        if (!loginRes.data.success) throw new Error('Admin login failed');
        const token = loginRes.data.token;
        log('Admin logged in. Token obtained.');

        const headers = { Authorization: `Bearer ${token}` };

        // 2. Register a new tenant
        log('\n2. Registering dummy tenant...');
        const timestamp = Date.now();
        const tenantData = {
            name: `TestCorp_${timestamp}`,
            adminEmail: `test${timestamp}@example.com`,
            adminPassword: 'password123',
            plan: 'standard'
        };

        const regRes = await axios.post(`${API_URL}/admin/tenants/register`, tenantData);
        if (!regRes.data.success) throw new Error('Registration failed');
        const tenantId = regRes.data.data.id;
        log(`Tenant registered: ${tenantData.name} (ID: ${tenantId})`);

        // 3. Approve Tenant
        log('\n3. Approving tenant...');
        await axios.post(`${API_URL}/admin/tenants/${tenantId}/approve`, {}, { headers });
        log('Tenant approved and provisioned.');

        // 4. Update Tenant (Soft Delete)
        log('\n4. Testing Update (Soft Delete)...');
        const updateRes = await axios.put(`${API_URL}/admin/tenants/${tenantId}`, {
            status: 'inactive',
            plan: 'premium'
        }, { headers });

        if (updateRes.data.data.status !== 'inactive') throw new Error('Status update failed');
        if (updateRes.data.data.plan !== 'premium') throw new Error('Plan update failed');
        log('Tenant updated successfully (Inactive / Premium).');

        // 5. Permanent Delete
        log('\n5. Testing Permanent Delete...');
        await axios.delete(`${API_URL}/admin/tenants/${tenantId}`, { headers });
        log('Tenant deleted.');

        // 6. Verify Deletion
        log('\n6. Verifying Deletion...');
        try {
            await axios.put(`${API_URL}/admin/tenants/${tenantId}`, {}, { headers });
            throw new Error('Tenant should not exist!');
        } catch (err) {
            if (err.response && err.response.status === 404) {
                log('Success: Tenant not found (404) as expected.');
            } else {
                throw err;
            }
        }

        log('\n✅ ALL TESTS PASSED');

    } catch (error) {
        log('\n❌ TEST FAILED: ' + (error.stack || error.message));
        if (error.response) {
            log('Response Data: ' + JSON.stringify(error.response.data));
            log('Response Status: ' + error.response.status);
        }
        process.exit(1);
    }
}

runTest();
