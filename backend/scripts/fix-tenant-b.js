
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TENANT_B_DB = 'sku_test_tenant_b';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..'); // specific to where this script is: backend/scripts -> backend -> root

async function migrateTenantB() {
    console.log(`Applying migrations to ${TENANT_B_DB}...`);

    try {
        // Set environment variable for this command only
        // Windows syntax involved, but exec handles Env vars option

        const env = {
            ...process.env,
            DB_NAME: TENANT_B_DB
        };

        const { stdout, stderr } = await execPromise('npx sequelize-cli db:migrate', {
            cwd: path.join(PROJECT_ROOT, 'backend'), // Run from backend folder where .sequelizerc usually is or config
            env: env
        });

        console.log('stdout:', stdout);
        if (stderr) console.error('stderr:', stderr);

        console.log('✅ Migrations applied successfully.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        if (error.stdout) console.log('stdout:', error.stdout);
        if (error.stderr) console.error('stderr:', error.stderr);
    }
}

migrateTenantB();
