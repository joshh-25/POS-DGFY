import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: join(dirname(__filename), '..', '.env') });

const TABLE_NAME = 'pos_terminal_shifts';
const COLUMN_NAME = 'active_operator_user_id';
const INDEX_NAME = 'uq_pos_terminal_shifts_active_operator';

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;
const shouldApply = process.argv.includes('--apply');
const mutationApproved = String(process.env.TENANT_SCHEMA_MUTATION_APPROVED || '')
    .trim()
    .toLowerCase() === 'true';

if (shouldApply && !mutationApproved) {
    throw new Error(
        'Set TENANT_SCHEMA_MUTATION_APPROVED=true after backup and review before using --apply.'
    );
}

const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
});
const mainDatabase = process.env.DB_NAME || 'sku_inventory_manager';

const report = {
    mode: shouldApply ? 'apply' : 'dry_run',
    generated_at: new Date().toISOString(),
    tenants: []
};

try {
    const [tenants] = await connection.query(
        `SELECT id, name, db_name
           FROM ${quoteIdentifier(mainDatabase)}.tenants
          WHERE status = 'active'
          ORDER BY name, id`
    );

    const eligibleTenants = [];
    for (const tenant of tenants) {
        const [tableRows] = await connection.query(
            `SELECT COUNT(*) AS table_count
               FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = ?
                AND TABLE_NAME = ?`,
            [tenant.db_name, TABLE_NAME]
        );
        if (Number(tableRows?.[0]?.table_count || 0) === 0) {
            report.tenants.push({
                tenant_id: tenant.id,
                tenant_db: tenant.db_name,
                status: 'table_missing'
            });
            continue;
        }

        const [duplicates] = await connection.query(
            `SELECT cashier_id, COUNT(*) AS open_shift_count
               FROM ${quoteIdentifier(tenant.db_name)}.${quoteIdentifier(TABLE_NAME)}
              WHERE status = 'open'
              GROUP BY cashier_id
             HAVING COUNT(*) > 1`
        );
        if (duplicates.length > 0) {
            report.tenants.push({
                tenant_id: tenant.id,
                tenant_db: tenant.db_name,
                status: 'duplicate_open_shifts',
                duplicate_operators: duplicates
            });
            continue;
        }
        eligibleTenants.push(tenant);
    }

    const conflicts = report.tenants.filter((entry) => entry.status === 'duplicate_open_shifts');
    if (conflicts.length > 0) {
        throw new Error(
            'Duplicate open shifts exist. Close them explicitly before applying the operator invariant.'
        );
    }

    for (const tenant of eligibleTenants) {
        const [columnRows] = await connection.query(
            `SELECT COLUMN_NAME
               FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = ?
                AND TABLE_NAME = ?
                AND COLUMN_NAME = ?`,
            [tenant.db_name, TABLE_NAME, COLUMN_NAME]
        );
        const [indexRows] = await connection.query(
            `SELECT INDEX_NAME
               FROM INFORMATION_SCHEMA.STATISTICS
              WHERE TABLE_SCHEMA = ?
                AND TABLE_NAME = ?
                AND INDEX_NAME = ?`,
            [tenant.db_name, TABLE_NAME, INDEX_NAME]
        );
        const missingColumn = columnRows.length === 0;
        const missingIndex = indexRows.length === 0;

        if (shouldApply && missingColumn) {
            await connection.query(`
                ALTER TABLE ${quoteIdentifier(tenant.db_name)}.${quoteIdentifier(TABLE_NAME)}
                ADD COLUMN ${quoteIdentifier(COLUMN_NAME)} INTEGER
                GENERATED ALWAYS AS (
                    CASE WHEN ${quoteIdentifier('status')} = 'open'
                        THEN ${quoteIdentifier('cashier_id')}
                        ELSE NULL
                    END
                ) STORED
            `);
        }
        if (shouldApply && missingIndex) {
            await connection.query(`
                ALTER TABLE ${quoteIdentifier(tenant.db_name)}.${quoteIdentifier(TABLE_NAME)}
                ADD UNIQUE INDEX ${quoteIdentifier(INDEX_NAME)} (${quoteIdentifier(COLUMN_NAME)})
            `);
        }

        report.tenants.push({
            tenant_id: tenant.id,
            tenant_db: tenant.db_name,
            status: shouldApply
                ? (missingColumn || missingIndex ? 'applied' : 'compliant')
                : (missingColumn || missingIndex ? 'review' : 'compliant'),
            missing_column: missingColumn,
            missing_index: missingIndex
        });
    }
} finally {
    await connection.end();
}

console.log(JSON.stringify(report, null, 2));
