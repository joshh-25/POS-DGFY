import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
dotenv.config({ path: join(__dirname, '..', '.env') });

// Use dynamic import to ensure env is loaded first
const { User } = await import('../models/index.js');

const email = 'albertglor.supapo4@gmail.com';

const user = await User.findOne({ where: { email } });

if (user) {
    console.log('User found:');
    console.log('  - Role:', user.role);
    console.log('  - Permissions:', user.permissions);
    console.log('  - Is Master Admin:', user.is_master_admin);
    console.log('  - Is Active:', user.is_active);
    console.log('  - Invitation Status:', user.invitation_status);
} else {
    console.log('User NOT FOUND with email:', email);
}

process.exit(0);
