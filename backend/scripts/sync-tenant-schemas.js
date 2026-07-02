import crypto from 'crypto';
import fs from 'fs/promises';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Sequelize } from 'sequelize';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const MAIN_DB = process.env.DB_NAME || 'sku_inventory_manager';

export const REQUIRED_TENANT_SCHEMA_COLUMNS = Object.freeze({
    pos_catalog_overrides: Object.freeze({
        pos_always_available: Object.freeze({
            sql: "ALTER TABLE `pos_catalog_overrides` ADD COLUMN `pos_always_available` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'POS-only stock exemption; never changes Storefront visibility or Inventory stock truth'"
        })
    }),
    pos_transaction_lines: Object.freeze({
        stock_effect_type: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_lines` ADD COLUMN `stock_effect_type` ENUM('inventory_issue','stock_exempt') NOT NULL DEFAULT 'inventory_issue' COMMENT 'Immutable checkout-time stock-effect classification'"
        }),
        stock_exempt_reason: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_lines` ADD COLUMN `stock_exempt_reason` VARCHAR(80) NULL COMMENT 'Immutable reason when a POS sale line intentionally creates no inventory movement'"
        })
    })
});

export function normalizeErrorSignature(message) {
    const raw = String(message || '').trim();
    if (!raw) {
        return {
            error_code: 'unknown_error',
            normalized_message: 'unknown error',
            fingerprint: 'unknown'
        };
    }

    const lowered = raw.toLowerCase();
    let errorCode = 'unknown_error';
    if (lowered.includes('too many keys specified; max 64 keys allowed')) {
        errorCode = 'mysql_too_many_keys';
    } else if (lowered.includes('foreign key constraint is incorrectly formed') || lowered.includes('errno: 150')) {
        errorCode = 'mysql_foreign_key_incorrectly_formed';
    }

    const normalizedMessage = lowered
        .replace(/`[^`]+`/g, '`<redacted>`')
        .replace(/\b\d+\b/g, '#')
        .replace(/\s+/g, ' ')
        .trim();

    const fingerprint = crypto
        .createHash('sha1')
        .update(`${errorCode}|${normalizedMessage}`)
        .digest('hex')
        .slice(0, 16);

    return {
        error_code: errorCode,
        normalized_message: normalizedMessage,
        fingerprint
    };
}

export function createSyncFailureRecord(tenant, error) {
    const signature = normalizeErrorSignature(error?.message || error);
    return {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_db: tenant.db_name,
        status: 'failed',
        error_code: signature.error_code,
        error_message: String(error?.message || error || 'Unknown error'),
        normalized_message: signature.normalized_message,
        fingerprint: signature.fingerprint,
        missing_columns: Array.isArray(error?.missing_columns) ? error.missing_columns : undefined,
        repair_sql: Array.isArray(error?.repair_sql) ? error.repair_sql : undefined
    };
}

function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        reportFile: '',
        failOnError: false,
        mode: process.env.TENANT_SCHEMA_SYNC_MODE || 'report'
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--report-file') {
            options.reportFile = argv[i + 1] || '';
            i += 1;
            continue;
        }
        if (arg === '--fail-on-error') {
            options.failOnError = true;
            continue;
        }
        if (arg === '--mode') {
            options.mode = argv[i + 1] || options.mode;
            i += 1;
        }
    }
    return options;
}

export async function inspectRequiredTenantSchemaColumns(connection, tenantDb) {
    const tableNames = Object.keys(REQUIRED_TENANT_SCHEMA_COLUMNS);
    const [rows] = await connection.query(
        `SELECT TABLE_NAME, COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME IN (${tableNames.map(() => '?').join(', ')})`,
        [tenantDb, ...tableNames]
    );
    const present = new Set(rows.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
    const missingColumns = [];

    Object.entries(REQUIRED_TENANT_SCHEMA_COLUMNS).forEach(([table, columns]) => {
        Object.keys(columns).forEach((column) => {
            if (!present.has(`${table}.${column}`)) {
                missingColumns.push({ table, column });
            }
        });
    });

    return missingColumns;
}

export function buildTenantSchemaRepairSql(missingColumns = []) {
    return (Array.isArray(missingColumns) ? missingColumns : [])
        .map(({ table, column }) => ({
            table,
            column,
            sql: REQUIRED_TENANT_SCHEMA_COLUMNS?.[table]?.[column]?.sql || ''
        }))
        .filter((entry) => entry.sql);
}

async function writeReport(reportFile, payload) {
    if (!reportFile) {
        return;
    }
    await fs.mkdir(dirname(reportFile), { recursive: true });
    await fs.writeFile(reportFile, JSON.stringify(payload, null, 2), 'utf8');
}

export async function runTenantSchemaSync({ reportFile = '', failOnError = false, mode = 'report' } = {}) {
    const normalizedMode = String(mode || 'report').trim().toLowerCase();
    if (!['report', 'repair-dry-run', 'repair-apply', 'alter'].includes(normalizedMode)) {
        throw new Error(`Invalid tenant schema sync mode: ${mode}`);
    }

    console.log(`[TenantSchemaSync] starting mode=${normalizedMode}`);
    const report = {
        generated_at: new Date().toISOString(),
        landlord_db: MAIN_DB,
        host: DB_HOST,
        mode: normalizedMode,
        summary: {
            tenants_total: 0,
            succeeded: 0,
            failed: 0
        },
        results: []
    };

    const connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD
    });

    try {
        console.log(`[TenantSchemaSync] fetching active tenants from ${MAIN_DB}`);
        await connection.query(`USE ${MAIN_DB}`);
        const [tenants] = await connection.query(
            `SELECT id, name, db_name, company_token FROM tenants WHERE status = 'active'`
        );

        report.summary.tenants_total = tenants.length;
        console.log(`[TenantSchemaSync] active tenants=${tenants.length}`);

        for (const tenant of tenants) {
            const tenantSequelize = new Sequelize(tenant.db_name, DB_USER, DB_PASSWORD, {
                host: DB_HOST,
                dialect: 'mysql',
                logging: false
            });

            try {
                getTenantModels(tenantSequelize);
                if (normalizedMode === 'alter') {
                    await tenantSequelize.sync({ alter: true });
                } else {
                    await tenantSequelize.authenticate();
                    const missingColumns = await inspectRequiredTenantSchemaColumns(connection, tenant.db_name);
                    const repairSql = buildTenantSchemaRepairSql(missingColumns);

                    if (normalizedMode === 'repair-apply') {
                        for (const repair of repairSql) {
                            await connection.query(`USE \`${tenant.db_name.replace(/`/g, '``')}\``);
                            await connection.query(repair.sql);
                        }
                    }

                    const remainingMissingColumns = normalizedMode === 'repair-apply'
                        ? await inspectRequiredTenantSchemaColumns(connection, tenant.db_name)
                        : missingColumns;

                    if (remainingMissingColumns.length > 0 && normalizedMode === 'report') {
                        const error = new Error(`Missing required tenant schema columns: ${remainingMissingColumns.map((entry) => `${entry.table}.${entry.column}`).join(', ')}`);
                        error.missing_columns = remainingMissingColumns;
                        error.repair_sql = repairSql;
                        throw error;
                    }

                    if (remainingMissingColumns.length > 0 && normalizedMode === 'repair-dry-run') {
                        report.summary.failed += 1;
                        report.results.push({
                            tenant_id: tenant.id,
                            tenant_name: tenant.name,
                            tenant_db: tenant.db_name,
                            status: 'repair_required',
                            mode: normalizedMode,
                            missing_columns: remainingMissingColumns,
                            repair_sql: repairSql
                        });
                        console.warn(`[TenantSchemaSync] repair_required tenant=${tenant.db_name} missing=${remainingMissingColumns.map((entry) => `${entry.table}.${entry.column}`).join(',')}`);
                        continue;
                    }
                }
                report.summary.succeeded += 1;
                report.results.push({
                    tenant_id: tenant.id,
                    tenant_name: tenant.name,
                    tenant_db: tenant.db_name,
                    status: 'ok',
                    mode: normalizedMode
                });
                console.log(`[TenantSchemaSync] ok tenant=${tenant.db_name}`);
            } catch (error) {
                report.summary.failed += 1;
                const failure = createSyncFailureRecord(tenant, error);
                report.results.push(failure);
                console.error(
                    `[TenantSchemaSync] failed tenant=${tenant.db_name} code=${failure.error_code} fingerprint=${failure.fingerprint} message=${failure.error_message}`
                );
            } finally {
                await tenantSequelize.close();
            }
        }
    } finally {
        await connection.end();
    }

    await writeReport(reportFile, report);
    if (reportFile) {
        console.log(`[TenantSchemaSync] report_file=${reportFile}`);
    }
    console.log(
        `[TenantSchemaSync] completed total=${report.summary.tenants_total} ok=${report.summary.succeeded} failed=${report.summary.failed}`
    );
    console.log(JSON.stringify(report, null, 2));

    if (failOnError && report.summary.failed > 0) {
        process.exitCode = 1;
    }

    return report;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
    const options = parseArgs();
    runTenantSchemaSync(options).catch((error) => {
        console.error(`[TenantSchemaSync] fatal: ${error.message}`);
        process.exit(1);
    });
}
