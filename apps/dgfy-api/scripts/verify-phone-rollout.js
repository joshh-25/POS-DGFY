import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import {
  getPhoneCompletionEnforcementMode,
  getPhoneCompletionEnforcedTenants
} from '../src/config/phoneCompletionRollout.js';

dotenv.config();

const parseArgs = (argv = process.argv.slice(2)) => ({
  requireComplete: argv.includes('--require-complete'),
  requireSafeConfig: argv.includes('--require-safe-config'),
  includeUsers: argv.includes('--include-users')
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
    `SELECT id, name, db_name, company_token
       FROM ${quoteIdentifier(landlordDatabase)}.tenants
      WHERE status = 'active'
      ORDER BY name ASC`
  );
  return rows;
};

const readMissingUsers = async (connection, tenant) => {
  const [rows] = await connection.query(
    `SELECT user_id, username, email
       FROM ${quoteIdentifier(tenant.db_name)}.users
      WHERE deleted_at IS NULL
        AND is_active = 1
        AND (invitation_status IS NULL OR invitation_status = 'accepted')
        AND (phone_number IS NULL OR TRIM(phone_number) = '')
      ORDER BY email ASC, user_id ASC`
  );

  return rows.map((row) => ({
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    db_name: tenant.db_name,
    user_id: Number(row.user_id),
    username: row.username,
    email: row.email
  }));
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

export const runPhoneRolloutVerification = async ({
  requireComplete = false,
  requireSafeConfig = false,
  includeUsers = false
} = {}) => {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const tenants = await readActiveTenants(connection);
    const results = [];
    for (const tenant of tenants) {
      results.push(await inspectTenant(connection, tenant));
    }

    const enforcementMode = getPhoneCompletionEnforcementMode();
    const enforcedTenantAllowlist = getPhoneCompletionEnforcedTenants();
    const enforcedResults = results.filter((row) => {
      if (enforcementMode === 'all') return true;
      if (enforcementMode === 'observe') return false;
      return [row.id, row.company_token]
        .map((value) => String(value || ''))
        .some((value) => enforcedTenantAllowlist.includes(value));
    });
    const matchedAllowlistEntries = new Set(
      enforcedResults.flatMap((row) => [String(row.id || ''), String(row.company_token || '')])
    );
    const unmatchedEnforcedTenants = enforcementMode === 'tenant_allowlist'
      ? enforcedTenantAllowlist.filter((value) => !matchedAllowlistEntries.has(value))
      : [];
    const unsafeEnforcedTenants = enforcedResults.filter(
      (row) => row.status === 'missing_column' || Number(row.missing_phone_count || 0) > 0
    );

    const summary = {
      enforcement_mode: enforcementMode,
      enforced_tenant_allowlist: enforcedTenantAllowlist,
      tenant_count: results.length,
      complete_tenant_count: results.filter((row) => row.status === 'complete').length,
      incomplete_tenant_count: results.filter((row) => row.status === 'incomplete').length,
      missing_column_tenant_count: results.filter((row) => row.status === 'missing_column').length,
      active_user_count: results.reduce((sum, row) => sum + Number(row.active_user_count || 0), 0),
      missing_phone_count: results.reduce((sum, row) => sum + Number(row.missing_phone_count || 0), 0),
      enforced_tenant_count: enforcedResults.length,
      unsafe_enforced_tenant_count: unsafeEnforcedTenants.length,
      unmatched_enforced_tenant_count: unmatchedEnforcedTenants.length,
      unmatched_enforced_tenants: unmatchedEnforcedTenants,
      global_enforcement_ready:
        results.length > 0 &&
        results.every((row) => row.status === 'complete')
    };

    console.log('[PhoneRollout] summary');
    console.log(JSON.stringify(summary, null, 2));
    console.log('[PhoneRollout] tenants');
    console.log(JSON.stringify(results, null, 2));

    let missingUsers = [];
    if (includeUsers) {
      for (const tenant of results.filter((row) => row.status === 'incomplete')) {
        missingUsers = missingUsers.concat(await readMissingUsers(connection, tenant));
      }
      console.log('[PhoneRollout] missing_users');
      console.log(JSON.stringify(missingUsers, null, 2));
    }

    if (summary.missing_column_tenant_count > 0) {
      process.exitCode = 1;
    }
    if (requireComplete && summary.missing_phone_count > 0) {
      process.exitCode = 1;
    }
    if (requireSafeConfig && (unsafeEnforcedTenants.length > 0 || unmatchedEnforcedTenants.length > 0)) {
      process.exitCode = 1;
    }

    return { summary, results, missingUsers };
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
