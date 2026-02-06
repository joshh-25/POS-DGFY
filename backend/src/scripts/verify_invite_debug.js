
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const BASE_URL = 'http://localhost:5000/api/v1';

async function testApi() {
    console.log('--- TEST INVITATION API (DEBUG MODE) ---');

    // Dynamic import for sequelize
    const { sequelize } = await import('../models/index.js');

    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Fix schema if needed
        const User = sequelize.models.User;
        try {
            User.removeAttribute('deleted_by');
            User.removeAttribute('deleted_at');
        } catch (e) { }

        const adminEmail = 'admin@test.com';
        const adminPass = 'password123';

        // Ensure Admin Exists
        let admin = await User.findOne({ where: { email: adminEmail } });
        if (!admin) {
            console.log('Creating admin...');
            const hash = await bcrypt.hash(adminPass, 10);
            admin = await User.create({
                username: 'temp_debug_admin',
                email: adminEmail,
                password_hash: hash,
                role: 'admin',
                is_master_admin: true
            });
        } else {
            console.log('Updating admin password...');
            const hash = await bcrypt.hash(adminPass, 10);
            await admin.update({ password_hash: hash });
        }

        // Login
        console.log('🔑 Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: adminEmail,
            password: adminPass
        });

        const token = loginRes.data.data ? loginRes.data.data.token : loginRes.data.token;
        if (!token) {
            console.error('❌ No token received!');
            console.log('Login Response Body:', JSON.stringify(loginRes.data, null, 2));
            process.exit(1);
        }
        console.log(`✅ Token received (Length: ${token.length})`);
        // Check if token matches local secret
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log('✅ Local verification successful! Script and Server share the same secret.');
            console.log('Decoded:', decoded);
        } catch (verifyErr) {
            console.error('❌ Local verification FAILED! Server used a different secret.');
            console.error('Error:', verifyErr.message);
            console.log('Script JWT_SECRET:', process.env.JWT_SECRET ? process.env.JWT_SECRET.substring(0, 5) + '...' : 'UNDEFINED');
        }

        // Test Invite
        console.log('🚀 Sending Invite Request...');
        const testEmail = `debug_invite_${Date.now()}@example.com`;

        try {
            const inviteRes = await axios.post(
                `${BASE_URL}/users/invite`,
                {
                    email: testEmail,
                    role: 'staff' // Changed to staff to be simple
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Response Status:', inviteRes.status);
            console.log('✅ Response Data:', inviteRes.data);

        } catch (postErr) {
            console.error('❌ Invite Request Failed');
            if (postErr.response) {
                console.error('Status:', postErr.response.status);
                console.error('Data:', postErr.response.data);
                console.error('Headers:', postErr.response.headers);
            } else {
                console.error('Error:', postErr.message);
            }
        }

    } catch (error) {
        console.error('❌ Fatal Error:', error.message);
    } finally {
        process.exit(0);
    }
}

testApi();
