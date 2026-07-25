import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: join(dirname(__filename), '..', '.env') });

export const parseArgs = (argv = process.argv.slice(2)) => {
    const options = {
        tenantId: '',
        failOnConflict: false,
        json: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--tenant-id') {
            options.tenantId = String(argv[index + 1] || '').trim();
            index += 1;
            continue;
        }
        if (argument === '--fail-on-conflict') {
            options.failOnConflict = true;
            continue;
        }
        if (argument === '--json') {
            options.json = true;
        }
    }

    return options;
};

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

const listDuplicateRows = async (connection, tenantDb, groupingColumn) => {
    const safeDatabase = quoteIdentifier(tenantDb);
    const safeColumn = quoteIdentifier(groupingColumn);
    const [rows] = await connection.query(`
        SELECT
            s.pos_terminal_shift_id,
            s.cashier_id,
            s.terminal_id,
            s.location_id,
            s.business_date,
            s.opened_at,
            s.opening_float_amount
        FROM ${safeDatabase}.pos_terminal_shifts s
        INNER JOIN (
            SELECT ${safeColumn} AS conflict_key
            FROM ${safeDatabase}.pos_terminal_shifts
            WHERE status = 'open'
            GROUP BY ${safeColumn}
            HAVING COUNT(*) > 1
        ) conflicts
            ON conflicts.conflict_key = s.${safeColumn}
        WHERE s.status = 'open'
        ORDER BY s.${safeColumn}, s.opened_at, s.pos_terminal_shift_id
    `);
    return rows;
};

export async function auditOpenPosShiftConflicts({
    tenantId = '',
    failOnConflict = false,
    json = false,
    environment = process.env
} = {}) {
    const mainDatabase = environment.DB_NAME || 'sku_inventory_manager';
    const connection = await mysql.createConnection({
        host: environment.DB_HOST || 'localhost',
        user: environment.DB_USER || 'root',
        password: environment.DB_PASSWORD || ''
    });
    const report = {
        generated_at: new Date().toISOString(),
        mode: 'read_only',
        tenant_count: 0,
        conflict_count: 0,
        tenants: []
    };

    try {
        const replacements = [];
        let tenantFilter = '';
        if (tenantId) {
            tenantFilter = ' AND id = ?';
            replacements.push(tenantId);
        }
        const [tenants] = await connection.query(
            `SELECT id, name, db_name
               FROM ${quoteIdentifier(mainDatabase)}.tenants
              WHERE status = 'active'${tenantFilter}
              ORDER BY name, id`,
            replacements
        );
        report.tenant_count = tenants.length;

        for (const tenant of tenants) {
            const [tableRows] = await connection.query(
                `SELECT COUNT(*) AS table_count
                   FROM INFORMATION_SCHEMA.TABLES
                  WHERE TABLE_SCHEMA = ?
                    AND TABLE_NAME = 'pos_terminal_shifts'`,
                [tenant.db_name]
            );
            if (Number(tableRows?.[0]?.table_count || 0) === 0) {
                report.tenants.push({
                    tenant_id: tenant.id,
                    tenant_name: tenant.name,
                    tenant_db: tenant.db_name,
                    status: 'table_missing',
                    operator_conflicts: [],
                    terminal_conflicts: []
                });
                continue;
            }

            const operatorConflicts = await listDuplicateRows(connection, tenant.db_name, 'cashier_id');
            const terminalConflicts = await listDuplicateRows(connection, tenant.db_name, 'terminal_id');
            const tenantConflictCount = operatorConflicts.length + terminalConflicts.length;
            report.conflict_count += tenantConflictCount;
            report.tenants.push({
                tenant_id: tenant.id,
                tenant_name: tenant.name,
                tenant_db: tenant.db_name,
                status: tenantConflictCount > 0 ? 'conflict' : 'ok',
                operator_conflicts: operatorConflicts,
                terminal_conflicts: terminalConflicts
            });
        }
    } finally {
        await connection.end();
    }

    if (json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(
            `[OpenShiftConflictAudit] tenants=${report.tenant_count} conflicting_rows=${report.conflict_count}`
        );
        report.tenants.forEach((tenant) => {
            console.log(
                `[OpenShiftConflictAudit] tenant=${tenant.tenant_db} status=${tenant.status} `
                + `operator_rows=${tenant.operator_conflicts.length} terminal_rows=${tenant.terminal_conflicts.length}`
            );
            tenant.operator_conflicts.forEach((shift) => {
                console.log(
                    `  operator user_id=${shift.cashier_id} shift_id=${shift.pos_terminal_shift_id} `
                    + `terminal=${shift.terminal_id} opened_at=${shift.opened_at}`
                );
            });
        });
    }

    if (failOnConflict && report.conflict_count > 0) {
        process.exitCode = 1;
    }
    return report;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
    auditOpenPosShiftConflicts(parseArgs()).catch((error) => {
        console.error(`[OpenShiftConflictAudit] fatal: ${error.message}`);
        process.exit(1);
    });
}
