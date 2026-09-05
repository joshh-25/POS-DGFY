import { sequelize as landlordSequelize } from '../../src/models/index.js';

const ensureColumn = async (tableName, columnName, definitionSql, afterColumnName = null) => {
  const [rows] = await landlordSequelize.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    { replacements: [tableName, columnName] }
  );

  if (Number(rows?.[0]?.count || 0) > 0) {
    return;
  }

  const afterClause = afterColumnName ? ` AFTER \`${afterColumnName}\`` : '';
  await landlordSequelize.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}${afterClause}`
  );
};

// #1015: previously ran all 24 probes above, strictly sequentially, on *every* call -- 3 direct
// call sites plus every createTestTenant() indirectly. `readinessPromise` makes concurrent callers
// within the same process await the single in-flight run instead of re-probing; a failed attempt
// clears the cache so a later call can retry rather than caching a rejection forever.
// BACKEND_TEST_MATRIX_LANDLORD_READY=true is a second, cheaper short-circuit: the matrix runner
// sets it on every db-tier chunk's env once its own preflight subprocess has already run this exact
// function once against the same landlord test database (scripts/run-backend-test-matrix.js's
// runSchemaPreflight()) -- so a chunk process skips all 24 probes entirely instead of merely
// deduping them within itself.
let readinessPromise = null;

const runReadinessProbes = async () => {
  await ensureColumn('tenants', 'db_host', 'VARCHAR(255) NULL DEFAULT "localhost"', 'company_token');
  await ensureColumn('tenants', 'admin_phone', 'VARCHAR(40) NULL', 'admin_email');
  await ensureColumn('tenants', 'owner_dgfy_account_id', 'CHAR(36) NULL', 'admin_password_hash');
  await ensureColumn('tenants', 'provisioning_source', 'VARCHAR(40) NOT NULL DEFAULT "public_registration"', 'owner_dgfy_account_id');
  await ensureColumn('tenants', 'ownership_status', 'VARCHAR(40) NOT NULL DEFAULT "claimed"', 'provisioning_source');
  await ensureColumn('tenants', 'ownership_transferred_at', 'DATETIME NULL', 'ownership_status');
  await ensureColumn('tenants', 'ownership_transferred_by', 'CHAR(36) NULL', 'ownership_transferred_at');
  await ensureColumn('tenants', 'current_period_end', 'DATETIME NULL', 'paymongo_source_id');
  await ensureColumn('tenants', 'last_expiry_notified_at', 'DATETIME NULL', 'rejection_reason');
  await ensureColumn('tenants', 'last_expiry_notification_type', 'VARCHAR(255) NULL', 'last_expiry_notified_at');
  await ensureColumn('dgfy_accounts', 'middle_name', 'VARCHAR(80) NULL', 'first_name');
  await ensureColumn('dgfy_accounts', 'email_verified_at', 'DATETIME NULL', 'is_active');
  await ensureColumn('dgfy_accounts', 'phone_verified_at', 'DATETIME NULL', 'email_verified_at');
  await ensureColumn('dgfy_accounts', 'business_step_up_verified_at', 'DATETIME NULL', 'phone_verified_at');
  await ensureColumn('dgfy_accounts', 'last_login_at', 'DATETIME NULL', 'business_step_up_verified_at');
  await ensureColumn('dgfy_accounts', 'provisioning_status', 'VARCHAR(40) NOT NULL DEFAULT "self_registered"', 'last_login_at');
  await ensureColumn('dgfy_accounts', 'temporary_password_active', 'TINYINT(1) NOT NULL DEFAULT 0', 'provisioning_status');
  await ensureColumn('dgfy_accounts', 'email_verification_source', 'VARCHAR(40) NULL', 'temporary_password_active');
  await ensureColumn('dgfy_accounts', 'merchant_terms_acknowledged_at', 'DATETIME NULL', 'email_verification_source');
  await ensureColumn('dgfy_accounts', 'deleted_at', 'DATETIME NULL', 'merchant_terms_acknowledged_at');
  await ensureColumn('dgfy_accounts', 'deleted_by', 'VARCHAR(120) NULL', 'deleted_at');
  await ensureColumn('dgfy_accounts', 'deletion_reason', 'VARCHAR(500) NULL', 'deleted_by');
  await ensureColumn('dgfy_account_tenant_memberships', 'last_selected_at', 'DATETIME NULL', 'accepted_at');
  await ensureColumn('users', 'phone_number', 'VARCHAR(40) NULL', 'email');
};

export const ensureLandlordTenantSchemaReady = () => {
  if (process.env.NODE_ENV !== 'test') return Promise.resolve();
  if (process.env.BACKEND_TEST_MATRIX_LANDLORD_READY === 'true') return Promise.resolve();

  if (!readinessPromise) {
    readinessPromise = runReadinessProbes().catch((err) => {
      // Allow a failed attempt to be retried on the next call instead of caching a rejection
      // forever for the lifetime of the process.
      readinessPromise = null;
      throw err;
    });
  }
  return readinessPromise;
};
