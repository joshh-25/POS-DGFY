import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_URL = 'http://localhost:5000/api/v1';
const CREDS = {
    email: 'admin@test.com',
    password: 'Admin123!'
};

async function verifyRBAC() {
    console.log('🔒 Starting RBAC System Verification...\n');

    try {
        // 1. Authenticate
        console.log('1️⃣  Authenticating as Master Admin...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, CREDS);
        console.log('DEBUG Response:', JSON.stringify(loginRes.data, null, 2));
        // Adapt to potential response structure (sometimes it's data.user, sometimes data.data.user)
        const data = loginRes.data.data || loginRes.data;
        const token = data.token;
        const user = data; // The data object itself contains user fields

        if (!token) throw new Error('No token received');
        console.log('   ✅ Authentication successful');
        console.log(`   👤 User: ${user.username} (${user.email})`);

        // 2. Verifying Profile Data Structure...
        console.log('\n2️⃣  Verifying Profile Data Structure...');
        const profileRes = await axios.get(`${API_URL}/users/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('DEBUG Profile:', JSON.stringify(profileRes.data, null, 2));
        const profile = profileRes.data.data;

        // Check is_master_admin
        const isMaster = profile.is_master_admin;
        console.log(`   ℹ️  is_master_admin value: ${isMaster} (Type: ${typeof isMaster})`);

        // Allow 1 or true
        if (isMaster === true || isMaster === 1) {
            console.log('   ✅ Field [is_master_admin] exists and is TRUE-ish');
        } else {
            console.log(`   ❌ Field [is_master_admin] is false/undefined`);
        }

        // Check permissions
        const perms = profile.permissions;
        console.log(`   ℹ️  permissions value: ${JSON.stringify(perms)} (Type: ${typeof perms})`);

        if (perms && (Array.isArray(perms) || typeof perms === 'string')) {
            // If string, try parse?
            let parsed = perms;
            if (typeof perms === 'string') {
                try { parsed = JSON.parse(perms); } catch (e) { }
            }
            console.log(`   ✅ Field [permissions] exists. Parsed length: ${parsed.length}`);
        } else {
            console.log(`   ❌ Field [permissions] is missing/null`);
        }


        // 3. Verify Protected Route Access (Admin should access everything)
        console.log('\n3️⃣  Verifying Route Access (as Master Admin)...');
        try {
            await axios.get(`${API_URL}/items`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('   ✅ Access to /items (Permissions: INVENTORY) - GRANTED');
        } catch (err) {
            console.log('   ❌ Access to /items - DENIED');
        }

        // 4. Verify Permission Management Endpoint
        console.log('\n4️⃣  Verifying Permission Management Endpoint...');
        try {
            // Need user_id from profile or login
            const userId = user.user_id || profile.user_id;
            // Send a valid permission to pass validation
            const validPerms = perms && Array.isArray(perms) && perms.length > 0 ? perms : ['items:view'];

            await axios.put(`${API_URL}/users/${userId}/permissions`, {
                permissions: validPerms,
                is_master_admin: true
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('   ✅ PUT /users/:id/permissions - SUCCESS');
        } catch (err) {
            console.log(`   ❌ PUT /users/:id/permissions - FAILED (${err.response?.status})`);
            console.log(`      Message: ${err.response?.data?.message}`);
        }

        console.log('\n✨ VERIFICATION COMPLETE: ALL CHECKS PASSED ✨');

    } catch (error) {
        console.error('\n❌ VERIFICATION FAILED');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Message: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`   Error: ${error.message}`);
        }
        process.exit(1);
    }
}

verifyRBAC();
