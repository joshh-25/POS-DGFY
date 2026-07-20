/**
 * Read-only audit for original legacy account normalization readiness.
 * No writes are performed.
 *
 * Usage:
 *   node apps/dgfy-api/scripts/audit_original_legacy_account.js
 *   node apps/dgfy-api/scripts/audit_original_legacy_account.js --strict
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });
const args = new Set(process.argv.slice(2));
const strictMode = args.has('--strict')
  || String(process.env.ORIGINAL_LEGACY_AUDIT_STRICT || '').toLowerCase() === 'true';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.DB_PASS || '';
const LANDLORD_DB = process.env.DB_NAME || 'sku_inventory_manager';

const LEGACY_DB_NAME = process.env.ORIGINAL_LEGACY_DB_NAME || 'sku_inventory_manager';
const LEGACY_TOKEN = process.env.ORIGINAL_LEGACY_COMPANY_TOKEN || 'token-original';
const LEGACY_ADMIN_EMAIL = (process.env.ORIGINAL_LEGACY_ADMIN_EMAIL || 'admin@test.com').toLowerCase().trim();

const SAFE_DB_NAME = /^[a-zA-Z0-9_]+$/;

const classifyPermissions = (value) => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value !== 'string') return typeof value;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return 'json_array_string';
    if (parsed && typeof parsed === 'object') return 'json_object_string';
    return 'json_scalar_string';
  } catch {
    return 'plain_string';
  }
};

const getTenantPermissionTypeSummary = async (connection, dbName) => {
  if (!SAFE_DB_NAME.test(dbName)) {
    return { db_name: dbName, error: 'unsafe_db_name', permission_types: {} };
  }

  try {
    const [rows] = await connection.query(
      `SELECT permissions FROM \`${dbName}\`.users`
    );

    const summary = {};
    for (const row of rows) {
      const type = classifyPermissions(row.permissions);
      summary[type] = (summary[type] || 0) + 1;
    }

    return {
      db_name: dbName,
      users_count: rows.length,
      permission_types: summary,
    };
  } catch (error) {
    return {
      db_name: dbName,
      error: error.message,
      permission_types: {},
    };
  }
};

async function runAudit() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: false,
  });

  try {
    const result = {
      timestamp: new Date().toISOString(),
      landlord_db: LANDLORD_DB,
      legacy_target: {
        db_name: LEGACY_DB_NAME,
        token: LEGACY_TOKEN,
        admin_email: LEGACY_ADMIN_EMAIL,
      },
      findings: {
        legacy_db_exists: false,
        tenant_by_db: null,
        tenant_by_token: null,
        mapping_for_legacy_email: [],
        legacy_admin_user: null,
        permission_shape_summary: [],
      },
      risks: [],
    };

    const [dbRows] = await connection.query('SHOW DATABASES LIKE ?', [LEGACY_DB_NAME]);
    result.findings.legacy_db_exists = Array.isArray(dbRows) && dbRows.length > 0;

    await connection.query(`USE \`${LANDLORD_DB}\``);

    const [tenantByDbRows] = await connection.query(
      `SELECT id, name, db_name, company_token, status, admin_email, plan, subscription_status
       FROM tenants WHERE db_name = ? LIMIT 1`,
      [LEGACY_DB_NAME]
    );

    const [tenantByTokenRows] = await connection.query(
      `SELECT id, name, db_name, company_token, status, admin_email, plan, subscription_status
       FROM tenants WHERE company_token = ? LIMIT 1`,
      [LEGACY_TOKEN]
    );

    result.findings.tenant_by_db = tenantByDbRows[0] || null;
    result.findings.tenant_by_token = tenantByTokenRows[0] || null;

    if (result.findings.tenant_by_db && result.findings.tenant_by_token
      && result.findings.tenant_by_db.id !== result.findings.tenant_by_token.id) {
      result.risks.push('token_db_conflict');
    }

    const [mappingRows] = await connection.query(
      `SELECT id, email, tenant_id, created_at, updated_at
       FROM user_tenant_mappings
       WHERE email = ?
       ORDER BY created_at DESC`,
      [LEGACY_ADMIN_EMAIL]
    );
    result.findings.mapping_for_legacy_email = mappingRows;

    if (result.findings.legacy_db_exists && SAFE_DB_NAME.test(LEGACY_DB_NAME)) {
      const [legacyAdminRows] = await connection.query(
        `SELECT user_id, username, email, role, is_active, is_master_admin, invitation_status, deleted_at
         FROM \`${LEGACY_DB_NAME}\`.users
         WHERE email = ?
         LIMIT 1`,
        [LEGACY_ADMIN_EMAIL]
      );
      result.findings.legacy_admin_user = legacyAdminRows[0] || null;
    }

    const [activeTenantRows] = await connection.query(
      `SELECT id, db_name FROM tenants WHERE status = 'active' ORDER BY db_name ASC`
    );

    const permissionSummary = [];
    for (const tenant of activeTenantRows) {
      if (!tenant.db_name) continue;
      const item = await getTenantPermissionTypeSummary(connection, tenant.db_name);
      permissionSummary.push(item);
    }

    // Always include legacy DB summary if it is not part of active tenants output.
    if (!permissionSummary.some((s) => s.db_name === LEGACY_DB_NAME) && result.findings.legacy_db_exists) {
      permissionSummary.push(await getTenantPermissionTypeSummary(connection, LEGACY_DB_NAME));
    }

    result.findings.permission_shape_summary = permissionSummary;

    if (!result.findings.legacy_db_exists) result.risks.push('legacy_db_missing');
    if (!result.findings.tenant_by_db) result.risks.push('tenant_record_missing_by_db');
    if (!result.findings.tenant_by_token) result.risks.push('tenant_record_missing_by_token');
    if (!result.findings.legacy_admin_user) result.risks.push('legacy_admin_user_missing');
    if (Array.isArray(mappingRows) && mappingRows.length === 0) result.risks.push('legacy_email_mapping_missing');

    const driftTypes = new Set([
      'json_object_string',
      'json_scalar_string',
      'plain_string',
      'null',
      'undefined',
    ]);
    const hasPermissionTypeDrift = permissionSummary.some((entry) => {
      const keys = Object.keys(entry.permission_types || {});
      return keys.some((k) => driftTypes.has(k));
    });
    if (hasPermissionTypeDrift) result.risks.push('permission_contract_drift_detected');

    console.log(JSON.stringify(result, null, 2));

    if (strictMode && result.risks.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

runAudit().catch((error) => {
  console.error(`Legacy audit failed: ${error.message}`);
  process.exit(1);
});
