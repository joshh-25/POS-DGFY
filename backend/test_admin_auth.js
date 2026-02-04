import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/v1';

async function testAdminAuth() {
    try {
        console.log('Testing Admin Login...');
        const loginResponse = await axios.post(`${BASE_URL}/admin/login`, {
            username: 'skupervisor',
            password: '252378'
        });

        if (loginResponse.data.success) {
            console.log('Login Successful!');
            const token = loginResponse.data.token;
            console.log('Token received:', token.substring(0, 20) + '...');

            console.log('Testing getTenants with token...');
            const tenantsResponse = await axios.get(`${BASE_URL}/admin/tenants`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (tenantsResponse.data.success) {
                console.log('Get Tenants Successful!');
                console.log('Tenants count:', tenantsResponse.data.data.length);
            } else {
                console.log('Get Tenants Failed:', tenantsResponse.data.message);
            }
        } else {
            console.log('Login Failed:', loginResponse.data.message);
        }
    } catch (error) {
        console.error('Error during test:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

testAdminAuth();
