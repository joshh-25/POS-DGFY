import axios from 'axios';

const API_URL = 'http://127.0.0.1:5000/api/v1';

async function reproduce() {
    try {
        console.log('Logging in...');
        const loginRes = await axios.post(`${API_URL}/admin/login`, {
            username: 'skupervisor',
            password: '252378'
        });

        if (!loginRes.data.success) throw new Error('Login failed');
        const token = loginRes.data.token;
        console.log('Login success');

        console.log('Fetching tenants list...');
        const listRes = await axios.get(`${API_URL}/admin/tenants`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('Success! Status:', listRes.status);
        console.log('Data sample:', listRes.data.data ? listRes.data.data.slice(0, 1) : 'No data');

    } catch (error) {
        console.error('FAILED');
        console.error('Status:', error.response?.status);
        console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    }
}

reproduce();
