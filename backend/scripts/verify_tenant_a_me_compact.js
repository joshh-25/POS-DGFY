import axios from 'axios';

const verify = async () => {
    try {
        const loginRes = await axios.post('http://localhost:5000/api/v1/auth/login', {
            email: 'admin@tenant-a.com',
            password: 'Admin123!'
        }, { headers: { 'x-company-token': 'token-tenant-a' } });

        const token = loginRes.data.data.token;

        const meRes = await axios.get('http://localhost:5000/api/v1/users/me', {
            headers: { 'x-company-token': 'token-tenant-a', 'Authorization': `Bearer ${token}` }
        });

        const u = meRes.data.data;
        console.error('--- TYPE CHECK ---');
        console.error(`is_master_admin: value=${u.is_master_admin}, type=${typeof u.is_master_admin}`);
        console.error(`permissions: type=${typeof u.permissions}, isArray=${Array.isArray(u.permissions)}`);
        if (typeof u.permissions === 'string') {
            console.error(`permissions (first 20 chars): ${u.permissions.substring(0, 20)}`);
        }
        console.error('------------------');

    } catch (e) { console.error(e.message); }
};
verify();
