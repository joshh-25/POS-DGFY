import mysql from 'mysql2/promise';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = 'sku_tenant_billing_test';

async function createDatabase() {
    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD,
        });

        await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.log(`✅ Database '${DB_NAME}' created or already exists`);
        await connection.end();
    } catch (error) {
        console.error('❌ Error creating database:', error.message);
        throw error;
    }
}

async function runMigrations() {
    try {
        console.log(`🔄 Running database migrations for ${DB_NAME}...`);
        // Pass DB_NAME in env to override config
        const cmd = process.platform === 'win32' ? `set DB_NAME=${DB_NAME}&& npm run migrate` : `DB_NAME=${DB_NAME} npm run migrate`;

        const { stdout, stderr } = await execAsync(cmd, {
            cwd: path.join(__dirname, '..'),
        });

        if (stderr && !stderr.includes('No migrations were executed')) {
            console.error('Migration warnings:', stderr);
        }

        console.log('✅ Migrations completed');
        if (stdout) {
            console.log(stdout);
        }
    } catch (error) {
        console.error('❌ Error running migrations:', error.message);
        throw error;
    }
}

async function runRestoreAdmin() {
    try {
        console.log('🔄 Restoring admin...');
        const { stdout, stderr } = await execAsync('node scripts/restore_admin.cjs', {
            cwd: path.join(__dirname, '..'),
        });
        console.log(stdout);
        console.error(stderr);
    } catch (error) {
        console.error('❌ Error restoring admin:', error);
    }
}

async function main() {
    await createDatabase();
    await runMigrations();
    await runRestoreAdmin();
}

main();
