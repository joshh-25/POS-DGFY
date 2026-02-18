import * as authService from './src/services/authService.js';
import dbStore from './src/utils/dbStore.js';
import sequelize from './src/config/database.js';
import db from './src/models/index.js';
import { initializeRedis } from './src/config/redis.js';

async function runTest() {
    try {
        console.log('🚀 Starting RTR Standalone Verification');

        // Connect Redis first (for blacklisting)
        await initializeRedis();
        console.log('✅ Redis Initialized');

        await sequelize.authenticate();
        console.log('✅ DB Connected');

        const tenantId = 'master';
        const store = { tenantId };

        await dbStore.run(store, async () => {
            console.log(`✅ Tenant context set to: ${tenantId}`);

            const userData = {
                username: 'rtr_test_user_final_v4',
                email: 'rtr_v4@example.com',
                password: 'TestPassword123!',
                role: 'staff'
            };

            // Clean up
            const User = dbStore.get('User');
            await User.destroy({ where: { email: userData.email } });

            // 1. Register
            console.log('📝 Registering user...');
            const regResult = await authService.registerUser(userData);
            const rt1 = regResult.refreshToken;
            console.log('✅ Registered. RT1 obtained.');

            // 2. Refresh 1
            console.log('🔄 Refreshing RT1 (First time)...');
            const refresh1 = await authService.refreshUserToken(rt1);
            const rt2 = refresh1.refreshToken;
            console.log('✅ Refresh 1 success. RT2 obtained.');
            if (rt1 === rt2) throw new Error('Refresh token was NOT rotated!');

            // 3. Refresh 2 (Replay RT1)
            console.log('🔄 Refreshing RT1 (Second time - Replay Attack)...');
            try {
                await authService.refreshUserToken(rt1);
                throw new Error('VULNERABILITY: RT1 was used twice!');
            } catch (error) {
                if (error.message.includes('reused') || error.message.includes('revoked')) {
                    console.log('✅ SUCCESS: RT1 reuse blocked as expected.');
                } else {
                    throw error;
                }
            }

            // 4. Refresh with RT2
            console.log('🔄 Refreshing RT2 (Valid reuse of new token)...');
            await authService.refreshUserToken(rt2);
            console.log('✅ Refresh with RT2 success.');

            console.log('🎊 ALL TESTS PASSED!');
        });

    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        if (error.stack) console.error(error.stack);
    } finally {
        try {
            await sequelize.close();
        } catch (e) { }
        process.exit();
    }
}

runTest();
