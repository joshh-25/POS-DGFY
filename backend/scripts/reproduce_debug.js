
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:5000/api/v1';
const LOGIN_EMAIL = 'admin@test.com';
const LOGIN_PASSWORD = 'Admin123!';

async function runTest() {
    console.log('🧪 Starting Reproduction Test...');

    try {
        // 1. Attempt Login
        console.log('\n📝 Attempting Login...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: LOGIN_EMAIL,
            password: LOGIN_PASSWORD
        }, { validateStatus: () => true });

        console.log(`Response Status: ${loginRes.status}`);

        if (loginRes.status !== 200) {
            console.error('❌ Login failed:', loginRes.data);
            if (loginRes.status === 401) {
                console.error('   -> 401 Unauthorized during login indicates invalid credentials or auth service failure.');
            }
            return;
        }

        const token = loginRes.data.data.token;
        console.log('✅ Login successful. Token received.');
        console.log(`   Token prefix: ${token.substring(0, 10)}...`);

        // 2. Test Dashboard Stats
        console.log('\n📊 Testing /dashboard/stats ...');
        const statsRes = await axios.get(`${API_URL}/dashboard/stats`, {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true
        });

        console.log(`Response Status: ${statsRes.status}`);
        if (statsRes.status === 500) {
            console.log('❌ Reproduced 500 Internal Server Error!');
            console.log('   Response Body:', JSON.stringify(statsRes.data, null, 2));
        } else if (statsRes.status === 401) {
            console.log('❌ Reproduced 401 Unauthorized on protected route!');
            console.log('   Response Body:', JSON.stringify(statsRes.data, null, 2));
        } else {
            console.log('✅ Request successful (No error reproduced).');
            console.log('   Data:', JSON.stringify(statsRes.data, null, 2));
        }

        // 3. Test Dashboard Low Stock
        console.log('\n📉 Testing /dashboard/low-stock ...');
        const lowStockRes = await axios.get(`${API_URL}/dashboard/low-stock`, {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true
        });
        console.log(`Response Status: ${lowStockRes.status}`);
        if (lowStockRes.status !== 200) {
            console.log('❌ Request failed:', JSON.stringify(lowStockRes.data, null, 2));
        }

        // 4. Test Recent Movements
        console.log('\n🚚 Testing /dashboard/recent-movements ...');
        const movementsRes = await axios.get(`${API_URL}/dashboard/recent-movements`, {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true
        });
        console.log(`Response Status: ${movementsRes.status}`);
        if (movementsRes.status !== 200) {
            console.log('❌ Request failed:', JSON.stringify(movementsRes.data, null, 2));
        }

        // 5. Test Suppliers
        console.log('\n🏭 Testing /suppliers ...');
        const suppliersRes = await axios.get(`${API_URL}/suppliers`, {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true
        });
        console.log(`Response Status: ${suppliersRes.status}`);
        if (suppliersRes.status !== 200) {
            console.log('❌ Request failed:', JSON.stringify(suppliersRes.data, null, 2));
        }

        // 6. Test Purchase Orders
        console.log('\n📑 Testing /purchase-orders ...');
        const poRes = await axios.get(`${API_URL}/purchase-orders`, {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true
        });
        console.log(`Response Status: ${poRes.status}`);
        if (poRes.status !== 200) {
            console.log('❌ Request failed:', JSON.stringify(poRes.data, null, 2));
        }

    } catch (error) {
        console.error('🔥 Unexpected error executing test script:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('   -> Could not connect to server. Is the backend running?');
        }
    }
}

runTest();
