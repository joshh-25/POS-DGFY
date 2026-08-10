import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_ROLE_PERMISSIONS, getAllPermissions } from '../src/config/permissions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const LANDLORD_DB = process.env.DB_NAME || 'sku_inventory_manager';
const BACKFILL_ALL_ROLES = process.env.BACKFILL_ROLE_PERMISSIONS_ALL === '1';

const TARGETED_ROLES = new Set(['admin', 'manager', 'staff']);
const IDENTIFIER_SAFE = /^[A-Za-z0-9_]+$/;

const ensureSafeIdentifier = (identifier) => {
  if (!IDENTIFIER_SAFE.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return identifier;
};

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const parsePermissions = (raw) => {
  if (Array.isArray(raw)) return raw.filter((entry) => typeof entry === 'string');
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  }
  if (typeof raw === 'object') {
    const flattened = [];
    Object.entries(raw).forEach(([entity, actions]) => {
      if (!actions || typeof actions !== 'object') return;
      Object.entries(actions).forEach(([action, allowed]) => {
        if (allowed) flattened.push(`${entity}:${action}`);
      });
    });
    return flattened;
  }
  return [];
};

const getExpectedPermissions = ({ role, isMasterAdmin }) => {
  if (isMasterAdmin) {
    return getAllPermissions();
  }
  return DEFAULT_ROLE_PERMISSIONS[role] || [];
};

const shouldBackfillRole = ({ role, isMasterAdmin }) => {
  if (isMasterAdmin) return true;
  if (BACKFILL_ALL_ROLES) return true;
  return TARGETED_ROLES.has(role);
};

const listDatabases = async (connection) => {
  const safeLandlordDb = ensureSafeIdentifier(LANDLORD_DB);
  const [tenantRows] = await connection.query(
    `SELECT db_name FROM \`${safeLandlordDb}\`.tenants WHERE db_name IS NOT NULL AND db_name <> ''`
  );
  const names = new Set([safeLandlordDb]);
  for (const row of tenantRows) {
    const dbName = String(row?.db_name || '').trim();
    if (!dbName) continue;
    if (!IDENTIFIER_SAFE.test(dbName)) continue;
    names.add(dbName);
  }
  return [...names];
};

const getTableColumns = async (connection, dbName, tableName) => {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`,
    [dbName, tableName]
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME)));
};

const backfillDatabase = async (connection, dbName) => {
  const safeDbName = ensureSafeIdentifier(dbName);
  const columns = await getTableColumns(connection, safeDbName, 'users');
  if (!columns.has('role') || !columns.has('permissions')) {
    return { scanned: 0, updated: 0, skipped: true, reason: 'users table missing role/permissions' };
  }

  const idColumn = columns.has('user_id') ? 'user_id' : (columns.has('id') ? 'id' : null);
  if (!idColumn) {
    return { scanned: 0, updated: 0, skipped: true, reason: 'users table missing primary key column' };
  }

  const selectParts = [
    `\`${idColumn}\` AS pk`,
    '`role`',
    '`permissions`'
  ];
  if (columns.has('is_master_admin')) {
    selectParts.push('`is_master_admin`');
  } else {
    selectParts.push('0 AS is_master_admin');
  }

  const [users] = await connection.query(
    `SELECT ${selectParts.join(', ')} FROM \`${safeDbName}\`.users`
  );

  let scanned = 0;
  let updated = 0;

  for (const user of users) {
    scanned += 1;
    const role = normalizeRole(user.role);
    const isMasterAdmin = Number(user.is_master_admin || 0) === 1;

    if (!shouldBackfillRole({ role, isMasterAdmin })) {
      continue;
    }

    const expected = getExpectedPermissions({ role, isMasterAdmin });
    if (!Array.isArray(expected) || expected.length === 0) {
      continue;
    }

    const currentPermissions = parsePermissions(user.permissions);
    const currentSet = new Set(currentPermissions);
    const missing = expected.filter((permission) => !currentSet.has(permission));
    if (missing.length === 0) {
      continue;
    }

    const merged = [...new Set([...currentPermissions, ...missing])].sort();
    await connection.query(
      `UPDATE \`${safeDbName}\`.users SET permissions = ? WHERE \`${idColumn}\` = ?`,
      [JSON.stringify(merged), user.pk]
    );
    updated += 1;
  }

  return { scanned, updated, skipped: false, reason: '' };
};

const main = async () => {
  console.log('[PermissionBackfill] Starting role permission backfill');
  console.log(`[PermissionBackfill] landlord_db=${LANDLORD_DB} host=${DB_HOST}:${DB_PORT} backfill_all_roles=${BACKFILL_ALL_ROLES ? '1' : '0'}`);

  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD
  });

  try {
    const databases = await listDatabases(connection);
    console.log(`[PermissionBackfill] Databases to process: ${databases.length}`);

    let totalScanned = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const dbName of databases) {
      try {
        const result = await backfillDatabase(connection, dbName);
        totalScanned += result.scanned;
        totalUpdated += result.updated;
        if (result.skipped) {
          totalSkipped += 1;
          console.log(`[PermissionBackfill] ${dbName}: skipped (${result.reason})`);
          continue;
        }
        console.log(`[PermissionBackfill] ${dbName}: scanned=${result.scanned} updated=${result.updated}`);
      } catch (error) {
        totalSkipped += 1;
        console.warn(`[PermissionBackfill] ${dbName}: failed (${error.message})`);
      }
    }

    console.log(`[PermissionBackfill] Complete: scanned=${totalScanned} updated=${totalUpdated} skipped_dbs=${totalSkipped}`);
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error('[PermissionBackfill] Fatal error:', error);
  process.exitCode = 1;
});
