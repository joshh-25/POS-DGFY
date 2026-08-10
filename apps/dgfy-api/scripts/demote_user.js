
import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import defaultModels from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

async function run() {
    try {
        console.log('Demoting users to staff...');
        const User = defaultModels.User;

        // Demote ID 1 and ID 3
        const idsToPromote = [1, 3];

        const { DEFAULT_ROLE_PERMISSIONS } = await import('../src/config/permissions.js');

        for (const id of idsToPromote) {
            const user = await User.findByPk(id);
            if (user) {
                user.role = 'staff';
                // Reset permissions to match staff defaults
                // Or clear them if auth.js/permissions.js logic implies default fallback (which it doesn't seem to).
                // So we explicitly set staff permissions.
                user.permissions = DEFAULT_ROLE_PERMISSIONS.staff;

                await user.save();
                console.log(`User ${user.username} (ID: ${id}) demoted to STAFF with limited permissions.`);
            } else {
                console.log(`User ID ${id} not found.`);
            }
        }

    } catch (error) {
        console.error('Demotion failed:', error);
    } finally {
        process.exit(0);
    }
}

run();
