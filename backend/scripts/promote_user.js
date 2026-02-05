
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
        console.log('Promoting users to admin...');
        const User = defaultModels.User;

        // Promote ID 1 and ID 3
        const idsToPromote = [1, 3];

        for (const id of idsToPromote) {
            const user = await User.findByPk(id);
            if (user) {
                user.role = 'admin';
                // Also ensure permissions are cleared or set to admin defaults?
                // Actually, if role is admin, authn middleware checks logic.
                // But auth.js checks permissions for specific actions.
                // Default role permissions helper maps admin -> all permissions.
                // But if user.permissions is explicitly stored, it might override?
                // Let's set permissions to null so it falls back to default role permissions? 
                // OR let's explicitly give them ALL permissions if the system relies on the column.

                // Looking at auth.js: 
                // const userPermissions = req.user.permissions || [];

                // Looking at permissions.js:
                // export const DEFAULT_ROLE_PERMISSIONS = { admin: getAllPermissions(), ... }

                // But does auth.js USE DEFAULT_ROLE_PERMISSIONS if user.permissions is empty?
                // No, auth.js line 132: `const userPermissions = req.user.permissions || [];`
                // It uses what's in the DB.
                // So we MUST populate the DB column with all permissions.

                const { getAllPermissions } = await import('../src/config/permissions.js');
                user.permissions = getAllPermissions();

                await user.save();
                console.log(`User ${user.username} (ID: ${id}) promoted to ADMIN with FULL permissions.`);
            } else {
                console.log(`User ID ${id} not found.`);
            }
        }

    } catch (error) {
        console.error('Promotion failed:', error);
    } finally {
        // models/index.js might keep connection open?
        // forcing exit.
        process.exit(0);
    }
}

run();
