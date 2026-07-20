import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

async function testInvitation() {
    // Dynamic imports to ensure env vars are loaded first
    const { sequelize } = await import('../models/index.js');
    const userService = await import('../services/userService.js');

    console.log('--- TEST INVITATION EMAIL ---');

    // Parse arguments
    const args = process.argv.slice(2);
    const emailArg = args.find(a => a.startsWith('--email='));
    const roleArg = args.find(a => a.startsWith('--role='));

    if (!emailArg) {
        console.error('❌ Error: Please provide an email address using --email=your@email.com');
        process.exit(1);
    }

    const email = emailArg.split('=')[1];
    const role = roleArg ? roleArg.split('=')[1] : 'staff';

    console.log(`📧 Target Email: ${email}`);
    console.log(`👤 Target Role: ${role}`);

    try {
        // Connect to Database
        await sequelize.authenticate();
        console.log('✅ Database Connection: OK');

        // We need an admin user to "send" the invite.
        const User = sequelize.models.User;

        // WORKAROUND: Remove attributes that might be missing in local DB schema
        try {
            User.removeAttribute('deleted_by');
            User.removeAttribute('deleted_at');
            console.log('🔧 Applied schema workaround (removed deleted_by/deleted_at from model)');
        } catch (e) {
            console.warn('⚠️ Could not apply schema workaround:', e.message);
        }

        let admin = await User.findOne({
            attributes: ['user_id', 'username', 'email', 'role'],
            where: {
                [sequelize.Sequelize.Op.or]: [
                    { is_master_admin: true },
                    { role: 'admin' }
                ]
            }
        });

        if (!admin) {
            console.log('⚠️ No admin user found. Creating temporary test admin...');
            try {
                // Create a test master admin
                admin = await User.create({
                    username: 'test_admin',
                    email: 'admin@test.com',
                    password_hash: '$2b$10$EpRnTzVlqHNP0.fKb.U.H.uFof9.eDdm/n0.uh.y', // dummy hash
                    role: 'admin',
                    is_master_admin: true,
                    is_active: true
                });
                console.log(`✅ Created test admin: ${admin.username} (${admin.user_id})`);
            } catch (createError) {
                console.error('❌ Failed to create test admin:', createError.message);
                // Try one more time without is_master_admin if it fails due to column missing?
                // But we removed legacy columns. is_master_admin should be there.
                process.exit(1);
            }
        }

        console.log(`👮 Inviter: ${admin.username} (${admin.email})`);

        // Send Invitation
        console.log('🚀 Sending invitation...');
        const result = await userService.createUserInvitation(admin.user_id, {
            email,
            role
        });

        console.log('\n✅ INVITATION RESULT:');
        console.log(JSON.stringify(result, null, 2));

        if (result.email_sent) {
            console.log('\n✨ SUCCESS: Email sent successfully! Check the inbox.');
        } else {
            console.log('\n⚠️ WARNING: Email was NOT sent (check SMTP config).');
            console.log(`🔗 Manual Token: ${result.invitation_token}`);
        }

        process.exit(0);

    } catch (error) {
        console.error('\n❌ FAILED:', error.message);
        if (error.statusCode) console.error(`   Status Code: ${error.statusCode}`);
        process.exit(1);
    }
}

testInvitation();
