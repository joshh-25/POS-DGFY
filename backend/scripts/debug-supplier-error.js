
import axios from 'axios';

const API_URL = 'http://localhost:5000/api/v1';
const TENANT_B_TOKEN = 'token-tenant-b';

async function reproduceError() {
    try {
        console.log('1. Logging in as Tenant B...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@tenant-b.com',
            password: 'Admin123!'
        }, {
            headers: { 'x-company-token': TENANT_B_TOKEN }
        });

        const token = loginRes.data.data.token;
        console.log('Login successful. Token:', token.substring(0, 20) + '...');

        console.log('\n2. Fetching Suppliers...');
        try {
            const res = await axios.get(`${API_URL}/suppliers`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-company-token': TENANT_B_TOKEN
                }
            });
            console.log('Success!', res.data);
        } catch (err) {
            console.error('❌ API Error:', err.response?.status, err.response?.statusText);
            console.error('Data:', JSON.stringify(err.response?.data, null, 2));
        }

    } catch (error) {
        console.error('Fatal Error:', error.message);
    }
}

reproduceError();
