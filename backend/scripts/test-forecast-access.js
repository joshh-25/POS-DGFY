import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:5000/api/v1';

const users = [
    { email: 'standard@test.com', type: 'Standard', expectedStatus: 403 },
    { email: 'premium@test.com', type: 'Premium', expectedStatus: 200 }
];

async function testAccess() {
    console.log('🧪 Starting Forecast Access Verification...\n');

    for (const user of users) {
        try {
            // 1. Login to get token
            console.log(`[${user.type}] Logging in as ${user.email}...`);
            const loginRes = await axios.post(`${BASE_URL}/auth/lookup`, { email: user.email });

            // Check if token is directly in data or inside data.token (axios wraps response in data)
            const token = loginRes.data.token || loginRes.data.data?.token;

            if (!token) {
                console.error(`❌ [${user.type}] Login failed: No token returned. Response:`, loginRes.data);
                continue;
            }
            console.log(`✅ [${user.type}] Login successful. Token obtained.`);

            // 2. Try to access restricted endpoint
            console.log(`[${user.type}] Attempting validation request to /forecast/stock-levels...`);
            const forecastRes = await axios.get(`${BASE_URL}/forecast/stock-levels`, {
                headers: { Authorization: `Bearer ${token}` },
                validateStatus: () => true // Prevent throw on 4xx/5xx
            });

            // 3. Verify result
            if (forecastRes.status === user.expectedStatus) {
                console.log(`✅ [${user.type}] PASS: Got expected status ${forecastRes.status}`);
            } else {
                console.error(`❌ [${user.type}] FAIL: Expected ${user.expectedStatus}, got ${forecastRes.status}`);
                console.error('Response data:', forecastRes.data);
            }

        } catch (error) {
            console.error(`❌ [${user.type}] Unexpected error:`, error.message);
            if (error.cause) console.error('Cause:', error.cause);
            if (error.code) console.error('Code:', error.code);
            if (error.response) {
                console.error('Response Status:', error.response.status);
                // console.error('Response Data:', error.response.data); // Too verbose sometimes
            }
        }
        console.log('-'.repeat(40));
    }
}

testAccess();
