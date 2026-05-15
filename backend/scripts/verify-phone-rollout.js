import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const parseArgs = (argv = process.argv.slice(2)) => ({
  requireComplete: argv.includes('--require-complete')
});

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
};

const landlordDatabase = process.env.DB_NAME || 'sku_inventory_manager';

const quoteIdentifier = (value) => `\`${String(value || '').replaceAll('`', '``')}\``;

const readActiveTenants = async (connection) => {
  const [rows] = await connection.query(
    `SELECT id, name, db_name
       FROM ${quoteIdentifier(landlordDatabase)}.tenants
      WHERE status = 'active'
      ORDER BY name ASC`
  );
  return rows;
};

const inspectTenant = async (connection, tenant) => {
  const [columnRows] = await connection.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = 'users'
        AND column_name = 'phone_number'`,
    [tenant.db_name]
  );
  const hasPhoneNumberColumn = Number(columnRows[0]?.count || 0) > 0;

  if (!hasPhoneNumberColumn) {
    return {
      ...tenant,
      status: 'missing_column',
      active_user_count: null,
      missing_phone_count: null
    };
  }

  const [userRows] = await connection.query(
    `SELECT
        COUNT(*) AS active_user_count,
        SUM(
          CASE
            WHEN phone_number IS NULL OR TRIM(phone_number) = '' THEN 1
            ELSE 0
          END
        ) AS missing_phone_count
       FROM ${quoteIdentifier(tenant.db_name)}.users
      WHERE deleted_at IS NULL
        AND is_active = 1
        AND (invitation_status IS NULL OR invitation_status = 'accepted')`
  );

  return {
    ...tenant,
    status: Number(userRows[0]?.missing_phone_count || 0) > 0 ? 'incomplete' : 'complete',
    active_user_count: Number(userRows[0]?.active_user_count || 0),
    missing_phone_count: Number(userRows[0]?.missing_phone_count || 0)
  };
};

export const runPhoneRolloutVerification = async ({ requireComplete = false } = {}) => {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const tenants = await readActiveTenants(connection);
    const results = [];
    for (const tenant of tenants) {
      results.push(await inspectTenant(connection, tenant));
    }

    const summary = {
      tenant_count: results.length,
      complete_tenant_count: results.filter((row) => row.status === 'complete').length,
      incomplete_tenant_count: results.filter((row) => row.status === 'incomplete').length,
      missing_column_tenant_count: results.filter((row) => row.status === 'missing_column').length,
      active_user_count: results.reduce((sum, row) => sum + Number(row.active_user_count || 0), 0),
      missing_phone_count: results.reduce((sum, row) => sum + Number(row.missing_phone_count || 0), 0)
    };

    console.log('[PhoneRollout] summary');
    console.log(JSON.stringify(summary, null, 2));
    console.log('[PhoneRollout] tenants');
    console.log(JSON.stringify(results, null, 2));

    if (summary.missing_column_tenant_count > 0) {
      process.exitCode = 1;
    }
    if (requireComplete && summary.missing_phone_count > 0) {
      process.exitCode = 1;
    }

    return { summary, results };
  } finally {
    await connection.end();
  }
};

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  runPhoneRolloutVerification(parseArgs()).catch((error) => {
    console.error(`[PhoneRollout] fatal: ${error.message}`);
    process.exit(1);
  });
}
