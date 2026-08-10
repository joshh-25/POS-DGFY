
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const BASE_URL = 'http://localhost:5000/api/v1'; // Adjust port if needed

// Test Credentials

// Test Credentials - Hardcoded

// import { sequelize } from '../models/index.js'; // REMOVED to allow dynamic import

async function testApi() {
    console.log('--- TEST INVITATION API ---');

    console.log('⏳ Connecting to database...');
    // Dynamic import to ensure env vars are loaded first
    const { sequelize } = await import('../models/index.js');

    // 1. Setup Admin User with Known Password
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        const User = sequelize.models.User;

        // WORKAROUND: Remove attributes that might be missing in local DB schema
        try {
            User.removeAttribute('deleted_by');
            User.removeAttribute('deleted_at');
            console.log('🔧 Applied schema workaround (removed deleted_by/deleted_at from model)');
        } catch (e) {
            console.warn('⚠️ Could not apply schema workaround:', e.message);
        }

        let admin = await User.findOne({ where: { email: 'admin@test.com' } });

        if (!admin) {
            console.log('Admin not found, creating...');
            // create...
            // But simpler to rely on previous script having run, or just create now.
            const hash = await bcrypt.hash('password123', 10);
            admin = await User.create({
                username: 'temp_api_admin',
                email: 'admin@test.com',
                password_hash: hash,
                role: 'admin',
                is_master_admin: true
            });
        } else {
            // Reset password to known one
            const hash = await bcrypt.hash('password123', 10);
            await admin.update({ password_hash: hash });
            console.log('✅ Reset admin password to "password123"');
        }
    } catch (e) {
        console.error('Database setup failed:', e.message);
        // Fallback: maybe the server is running and we can't touch DB easily 
        // (e.g. file lock), but usually it's fine.
    }

    // 2. Login
    console.log('🔑 Logging in...');
    let token;
    try {
        const res = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'admin@test.com',
            password: 'password123'
        });
        // Check for nested data structure (common in this API)
        token = res.data.data ? res.data.data.token : res.data.token;

        if (!token) {
            console.error('❌ Login successful but no token found in response');
            console.log('Response Body:', JSON.stringify(res.data, null, 2));
            process.exit(1);
        }
        console.log('✅ Login successful. Token obtained.');
    } catch (error) {
        console.error('❌ Login Failed:', error.response?.data || error.message);
        process.exit(1);
    }

    // 3. Test Invite Endpoint
    console.log('🚀 Testing POST /users/invite...');
    const testEmail = `api_test_${Date.now()}@example.com`;

    try {
        const res = await axios.post(
            `${BASE_URL}/users/invite`,
            {
                email: testEmail,
                role: 'manager'
            },
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        console.log('✅ API Response Status:', res.status);
        console.log('✅ Data:', res.data);

        if (res.data.success && res.data.data.email === testEmail) {
            console.log('\n✨ SUCCESS: API endpoint works as expected!');
            process.exit(0);
        } else {
            console.error('❌ Unexpected response structure.');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Invite Failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

testApi();

