import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const { default: sequelize } = await import('../src/config/database.js');
const { auditRuntimeSchemaReadiness } = await import('../src/services/runtimeSchemaAuditService.js');

const run = async () => {
    try {
        const result = await auditRuntimeSchemaReadiness({ sequelizeInstance: sequelize });
        console.log(`[RuntimeDoctor] status=${result.status} missing_migrations=${result.missingMigrations.length} missing_columns=${result.missingColumns.length} warnings=${result.warningCount} duration_ms=${result.durationMs}`);

        if (result.missingMigrations.length > 0) {
            console.log('[RuntimeDoctor] missing migrations:');
            result.missingMigrations.forEach((name) => console.log(` - ${name}`));
        }

        if (result.missingColumns.length > 0) {
            console.log('[RuntimeDoctor] missing required columns:');
            result.missingColumns.forEach((entry) => console.log(` - ${entry.table}.${entry.column}`));
        }

        if (result.warnings.length > 0) {
            console.log('[RuntimeDoctor] warnings:');
            result.warnings.forEach((warning) => console.log(` - ${warning.message}`));
        }

        process.exit(result.status === 'healthy' ? 0 : 1);
    } catch (error) {
        console.error('[RuntimeDoctor] failed:', error.message);
        process.exit(1);
    } finally {
        try {
            await sequelize.close();
        } catch (closeError) {
            console.warn('[RuntimeDoctor] warning: failed to close sequelize connection:', closeError.message);
        }
    }
};

run();
