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
        fingerprint: signature.fingerprint
    };
}

function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        reportFile: '',
        failOnError: false
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
        }
    }
    return options;
}

async function writeReport(reportFile, payload) {
    if (!reportFile) {
        return;
    }
    await fs.mkdir(dirname(reportFile), { recursive: true });
    await fs.writeFile(reportFile, JSON.stringify(payload, null, 2), 'utf8');
}

export async function runTenantSchemaSync({ reportFile = '', failOnError = false } = {}) {
    console.log('[TenantSchemaSync] starting');
    const report = {
        generated_at: new Date().toISOString(),
        landlord_db: MAIN_DB,
        host: DB_HOST,
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
                await tenantSequelize.sync({ alter: true });
                report.summary.succeeded += 1;
                report.results.push({
                    tenant_id: tenant.id,
                    tenant_name: tenant.name,
                    tenant_db: tenant.db_name,
                    status: 'ok'
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