import axios from 'axios';

const verifyTenantAMe = async () => {
    const loginUrl = 'http://localhost:5000/api/v1/auth/login';
    const meUrl = 'http://localhost:5000/api/v1/users/me';

    const payload = {
        email: 'admin@tenant-a.com',
        password: 'Admin123!'
    };
    const headers = {
        'Content-Type': 'application/json',
        'x-company-token': 'token-tenant-a'
    };

    try {
        // 1. Login
        console.log('Logging in...');
        const loginRes = await axios.post(loginUrl, payload, { headers });
        const token = loginRes.data.data.token;
        console.log('✅ Login Token Acquired');

        // 2. Get Me
        console.log('Fetching /me...');
        const meRes = await axios.get(meUrl, {
            headers: {
                ...headers,
                'Authorization': `Bearer ${token}`
            }
        });

        const user = meRes.data.data;
        console.log('✅ User Role:', user.role);
        console.log('✅ is_master_admin:', user.is_master_admin, typeof user.is_master_admin);
        console.log('✅ Permissions Type:', typeof user.permissions);
        console.log('✅ Permissions IsArray:', Array.isArray(user.permissions));
        console.log('✅ Permissions Sample:', JSON.stringify(user.permissions).substring(0, 100));

    } catch (error) {
        if (error.response) {
            console.error('❌ Error:', error.response.status, error.response.data);
        } else {
            console.error('❌ Error:', error.message);
        }
    }
};

verifyTenantAMe();
