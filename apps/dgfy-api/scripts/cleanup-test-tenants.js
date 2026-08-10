import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const TEST_TENANT_DB_PREFIX = 'test_tenant_';

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: Number.parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sku_inventory_manager'
};

const hasFlag = (flag) => process.argv.includes(flag);

const logPlan = (plan) => {
    console.log(`[cleanup:test-tenants] stale_tenant_rows=${plan.staleTenantRows.length}`);
    plan.staleTenantRows.forEach((row) => {
        console.log(` - stale_row id=${row.id} name=${row.name || 'unknown'} db_name=${row.db_name}`);
    });

    console.log(`[cleanup:test-tenants] drop_test_databases=${plan.databasesToDrop.length}`);
    plan.databasesToDrop.forEach((dbName) => {
        console.log(` - drop_db ${dbName}`);
    });
};

export const isSafeTestTenantDbName = (dbName) => (
    typeof dbName === 'string'
    && dbName.startsWith(TEST_TENANT_DB_PREFIX)
    && /^[a-z0-9_-]+$/.test(dbName)
);

export const buildTestTenantCleanupPlan = ({ tenants = [], databases = [] } = {}) => {
    const safeTenants = tenants.filter((tenant) => isSafeTestTenantDbName(tenant.db_name));
    const safeDatabases = databases.filter((dbName) => isSafeTestTenantDbName(dbName));
    const existingDatabaseSet = new Set(safeDatabases);
    const tenantDatabaseSet = new Set(safeTenants.map((tenant) => tenant.db_name));

    const staleTenantRows = safeTenants.filter((tenant) => !existingDatabaseSet.has(tenant.db_name));
    const orphanDatabases = safeDatabases.filter((dbName) => !tenantDatabaseSet.has(dbName));

    return {
        staleTenantRows,
        orphanDatabases,
        databasesToDrop: [...orphanDatabases]
    };
};

const hasRequiredTenantTables = async (connection, dbName) => {
    const requiredTables = ['items', 'stock_movements', 'job_orders', 'jo_ingredients'];
    const placeholders = requiredTables.map(() => '?').join(',');
    const [rows] = await connection.query(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME IN (${placeholders})`,
        [dbName, ...requiredTables]
    );
    return (rows || []).length === requiredTables.length;
};

const listLandlordTenants = async (connection) => {
    const [tableRows] = await connection.query("SHOW TABLES LIKE 'tenants'");
    if (!Array.isArray(tableRows) || tableRows.length === 0) {
        return [];
    }

    const [rows] = await connection.query(
        "SELECT id, name, status, db_name FROM tenants WHERE db_name LIKE 'test_tenant\\_%'"
    );
    return Array.isArray(rows) ? rows : [];
};

const listTestTenantDatabases = async (connection) => {
    const [rows] = await connection.query("SHOW DATABASES LIKE 'test_tenant\\_%'");
    return (rows || [])
        .map((row) => row.Database || row.database || Object.values(row)[0])
        .filter(Boolean);
};

const deleteTenantRows = async (connection, tenantIds = []) => {
    if (!Array.isArray(tenantIds) || tenantIds.length === 0) return;
    const placeholders = tenantIds.map(() => '?').join(',');
    await connection.query(`DELETE FROM tenants WHERE id IN (${placeholders})`, tenantIds);
};

const deleteTenantDependencies = async (connection, tenantIds = []) => {
    if (!Array.isArray(tenantIds) || tenantIds.length === 0) return;

    const [fkRows] = await connection.query(`
        SELECT TABLE_NAME, COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
          AND REFERENCED_TABLE_NAME = 'tenants'
          AND REFERENCED_COLUMN_NAME = 'id'
          AND TABLE_NAME <> 'tenants'
    `);

    const placeholders = tenantIds.map(() => '?').join(',');
    for (const fkRow of fkRows || []) {
        const tableName = fkRow.TABLE_NAME;
        const columnName = fkRow.COLUMN_NAME;
        if (!tableName || !columnName) continue;
        await connection.query(
            `DELETE FROM \`${tableName}\` WHERE \`${columnName}\` IN (${placeholders})`,
            tenantIds
        );
    }
};

const dropDatabases = async (connection, databases = []) => {
    for (const dbName of databases) {
        if (!isSafeTestTenantDbName(dbName)) {
            throw new Error(`Unsafe database name blocked: ${dbName}`);
        }
        await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    }
};

export const runCleanupTestTenants = async ({
    apply = false,
    force = false,
    dbConfig = DB_CONFIG
} = {}) => {
    const connection = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database
    });

    try {
        const [tenants, databases] = await Promise.all([
            listLandlordTenants(connection),
            listTestTenantDatabases(connection)
        ]);

        const basePlan = buildTestTenantCleanupPlan({
            tenants,
            databases
        });
        const existingDbSet = new Set(databases.filter((dbName) => isSafeTestTenantDbName(dbName)));
        const staleByMissingSchema = [];

        for (const tenant of tenants) {
            if (!isSafeTestTenantDbName(tenant.db_name)) continue;
            if (!existingDbSet.has(tenant.db_name)) continue;
            const schemaIsComplete = await hasRequiredTenantTables(connection, tenant.db_name);
            if (!schemaIsComplete) {
                staleByMissingSchema.push(tenant);
            }
        }

        const staleTenantById = new Map();
        [...basePlan.staleTenantRows, ...staleByMissingSchema].forEach((tenant) => {
            staleTenantById.set(tenant.id, tenant);
        });
        const staleTenantRows = [...staleTenantById.values()];
        const databasesToDrop = [...new Set([
            ...basePlan.orphanDatabases,
            ...staleTenantRows
                .map((tenant) => tenant.db_name)
                .filter((dbName) => existingDbSet.has(dbName))
        ])];

        const plan = {
            staleTenantRows,
            orphanDatabases: basePlan.orphanDatabases,
            databasesToDrop
        };

        logPlan(plan);

        if (!apply) {
            return {
                mode: 'dry_run',
                ...plan
            };
        }

        if (!force) {
            throw new Error('Refusing destructive cleanup without --yes confirmation flag.');
        }

        await connection.beginTransaction();
        try {
            const tenantIds = plan.staleTenantRows.map((row) => row.id);
            await deleteTenantDependencies(connection, tenantIds);
            await deleteTenantRows(connection, tenantIds);
            await connection.commit();
        } catch (error) {
            await connection.rollback().catch(() => null);
            throw error;
        }

        await dropDatabases(connection, plan.databasesToDrop);

        return {
            mode: 'apply',
            ...plan
        };
    } finally {
        await connection.end();
    }
};

const runCli = async () => {
    const apply = hasFlag('--apply');
    const force = hasFlag('--yes');

    try {
        const result = await runCleanupTestTenants({ apply, force });
        console.log(`[cleanup:test-tenants] mode=${result.mode} complete`);
    } catch (error) {
        console.error(`[cleanup:test-tenants] failed: ${error.message}`);
        process.exit(1);
    }
};

if (path.resolve(process.argv[1] || '') === __filename) {
    runCli();
}
