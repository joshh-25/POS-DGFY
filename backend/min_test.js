import * as authService from './src/services/authService.js';
import dbStore from './src/utils/dbStore.js';
import sequelize from './src/config/database.js';

async function runTest() {
    try {
        console.log('🚀 Starting Minimal Auth Test');
        await sequelize.authenticate();
        console.log('✅ DB Connected');
        dbStore.setTenantContext('master');

        const userData = {
            username: 'min_test_user',
            email: 'min_test@example.com',
            password: 'TestPassword123!',
            role: 'staff'
        };

        console.log('📝 Registering...');
        const result = await authService.registerUser(userData);
        console.log('✅ Registered:', result.username);
        console.log('✅ Refresh Token:', result.refreshToken ? 'Present' : 'MISSING');

        process.exit(0);
    } catch (error) {
        console.error('❌ FATAL ERROR:', error.message);
        process.exit(1);
    }
}

runTest();
