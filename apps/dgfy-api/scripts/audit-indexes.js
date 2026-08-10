import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Keep script output concise by disabling Sequelize SQL logging.
process.env.NODE_ENV = 'production';

const { default: sequelize } = await import('../src/config/database.js');
const { auditRequiredIndexes } = await import('../src/services/schemaIndexAuditService.js');

const parsePositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
};

const timeoutMs = parsePositiveInt(process.env.SCHEMA_INDEX_AUDIT_TIMEOUT_MS, 5000);
const auditMode = String(process.env.SCHEMA_INDEX_AUDIT_MODE || 'standard').trim().toLowerCase();
const excludeTestTenantDatabases = parseBoolean(process.env.SCHEMA_INDEX_AUDIT_EXCLUDE_TEST_TENANTS, false);

const loadContractOverride = async () => {
    const contractPath = process.env.SCHEMA_INDEX_AUDIT_CONTRACT_PATH;
    if (!contractPath) return null;

    const absolutePath = path.isAbsolute(contractPath)
        ? contractPath
        : path.resolve(process.cwd(), contractPath);

    const moduleUrl = pathToFileURL(absolutePath).href;
    const loadedModule = await import(moduleUrl);

    const contract =
        loadedModule.REQUIRED_INDEX_CONTRACT ||
        loadedModule.default?.REQUIRED_INDEX_CONTRACT ||
        loadedModule.default;

    if (!contract || typeof contract !== 'object') {
        throw new Error(
            `Invalid contract module at ${absolutePath}. Export REQUIRED_INDEX_CONTRACT or default object.`
        );
    }

    return contract;
};

const run = async () => {
    try {
        const contractOverride = await loadContractOverride();
        const result = await auditRequiredIndexes({
            sequelizeInstance: sequelize,
            timeoutMs,
            auditMode,
            excludeTestTenantDatabases,
            ...(contractOverride ? { contract: contractOverride } : {})
        });

        console.log(
            `[SchemaIndexAudit] status=${result.status} mode=${result.auditMode} tenants_checked=${result.tenantsChecked} missing=${result.missingCount} duration_ms=${result.durationMs}`
        );

        if (Array.isArray(result.excludedDatabases) && result.excludedDatabases.length > 0) {
            console.log(`[SchemaIndexAudit] excluded_databases=${result.excludedDatabases.join(',')}`);
        }

        if (result.errors.length > 0) {
            console.log('[SchemaIndexAudit] warnings/errors:');
            result.errors.forEach((error) => {
                console.log(` - scope=${error.scope}${error.database ? ` db=${error.database}` : ''}${error.table ? ` table=${error.table}` : ''} message=${error.message}`);
            });
        }

        if (result.missingCount > 0) {
            console.log('[SchemaIndexAudit] missing indexes:');
            result.missingIndexes.forEach((entry) => {
                console.log(` - db=${entry.database} table=${entry.table} type=${entry.type} columns=${entry.columns.join(',')} reason=${entry.reason}`);
            });
        }

        process.exit(result.status === 'healthy' ? 0 : 1);
    } catch (error) {
        console.error('[SchemaIndexAudit] audit failed:', error.message);
        process.exit(1);
    } finally {
        try {
            await sequelize.close();
        } catch (closeError) {
            console.warn('[SchemaIndexAudit] Warning: failed to close sequelize connection:', closeError.message);
        }
    }
};

run();
