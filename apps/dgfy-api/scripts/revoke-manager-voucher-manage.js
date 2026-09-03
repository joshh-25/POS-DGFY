import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PERMISSIONS } from '../src/config/permissions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// #1493 (Phase 263) -- the data half of "restrict voucher management to Admin + Accounting".
//
// Removing `vouchers:manage` from `DEFAULT_ROLE_PERMISSIONS.manager` only changes what
// `resolveEffectivePermissions` derives for a user whose stored `users.permissions` array is
// EMPTY. It cannot revoke the permission from a row that already has the string written into it --
// and #655's own `scripts/backfill-role-permissions.js` is additive and has had every deploy cycle
// since 2026-08-18 to write exactly that string into existing manager rows. Without this script the
// config change is a no-op for precisely the tenants that have been running longest.
//
// SAFETY -- this script is DRY-RUN BY DEFAULT and prints the rows it would change. It writes
// nothing until invoked with `--apply`. Run the dry run, read the output, then decide:
//
//   node apps/dgfy-api/scripts/revoke-manager-voucher-manage.js            # report only
//   node apps/dgfy-api/scripts/revoke-manager-voucher-manage.js --apply    # perform the revocation
//
// Scope is deliberately narrow, and each narrowing is a guard against a different mistake:
//   - `admin` rows are never touched          -> Admin keeps voucher management by design.
//   - `is_master_admin` rows are never touched -> that identity bypasses permission checks anyway.
//   - rows carrying an `*_accounting` preset are never touched -> that IS the new role.
//   - only the single string `vouchers:manage` is removed; `vouchers:view` and every other
//     permission in the array are preserved untouched.
//
// There is no `--undo`. Capture the dry-run output before applying it; that listing is the record
// of which rows to hand `vouchers:manage` back to if the revocation turns out to be wrong.

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const LANDLORD_DB = process.env.DB_NAME || 'sku_inventory_manager';

const APPLY = process.argv.includes('--apply');
const TARGET_PERMISSION = PERMISSIONS.VOUCHERS.actions.MANAGE;
const IDENTIFIER_SAFE = /^[A-Za-z0-9_]+$/;
const ACCOUNTING_PRESET_SUFFIX = '_accounting';

const ensureSafeIdentifier = (identifier) => {
  if (!IDENTIFIER_SAFE.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return identifier;
};

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

// Mirrors parsePermissions in scripts/backfill-role-permissions.js -- the column has been written
// as a JSON array, a JSON string, and (historically) a nested {entity:{action:bool}} object, so all
// three shapes have to read back.
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
    'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = ?',
    [dbName, tableName]
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME)));
};

const processDatabase = async (connection, dbName) => {
  const safeDbName = ensureSafeIdentifier(dbName);
  const columns = await getTableColumns(connection, safeDbName, 'users');
  if (!columns.has('role') || !columns.has('permissions')) {
    return { scanned: 0, matched: 0, updated: 0, skipped: true, reason: 'users table missing role/permissions', rows: [] };
  }

  const idColumn = columns.has('user_id') ? 'user_id' : (columns.has('id') ? 'id' : null);
  if (!idColumn) {
    return { scanned: 0, matched: 0, updated: 0, skipped: true, reason: 'users table missing primary key column', rows: [] };
  }

  const selectParts = [`\`${idColumn}\` AS pk`, '`role`', '`permissions`'];
  selectParts.push(columns.has('username') ? '`username`' : "'' AS username");
  selectParts.push(columns.has('is_master_admin') ? '`is_master_admin`' : '0 AS is_master_admin');
  selectParts.push(columns.has('role_preset_key') ? '`role_preset_key`' : 'NULL AS role_preset_key');

  const [users] = await connection.query(
    `SELECT ${selectParts.join(', ')} FROM \`${safeDbName}\`.users`
  );

  let scanned = 0;
  let matched = 0;
  let updated = 0;
  const rows = [];

  for (const user of users) {
    scanned += 1;

    if (Number(user.is_master_admin || 0) === 1) continue;
    if (normalizeRole(user.role) === 'admin') continue;
    if (String(user.role_preset_key || '').trim().endsWith(ACCOUNTING_PRESET_SUFFIX)) continue;

    const currentPermissions = parsePermissions(user.permissions);
    if (!currentPermissions.includes(TARGET_PERMISSION)) continue;

    matched += 1;
    rows.push({
      pk: user.pk,
      username: String(user.username || ''),
      role: normalizeRole(user.role),
      rolePresetKey: String(user.role_preset_key || '') || null
    });

    if (!APPLY) continue;

    const remaining = currentPermissions.filter((permission) => permission !== TARGET_PERMISSION);
    await connection.query(
      `UPDATE \`${safeDbName}\`.users SET permissions = ? WHERE \`${idColumn}\` = ?`,
      [JSON.stringify([...new Set(remaining)].sort()), user.pk]
    );
    updated += 1;
  }

  return { scanned, matched, updated, skipped: false, reason: '', rows };
};

const main = async () => {
  const mode = APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)';
  console.log(`[VoucherManageRevoke] ${mode} -- removing "${TARGET_PERMISSION}" from non-admin, non-accounting users`);
  console.log(`[VoucherManageRevoke] landlord_db=${LANDLORD_DB} host=${DB_HOST}:${DB_PORT}`);

  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD
  });

  try {
    const databases = await listDatabases(connection);
    console.log(`[VoucherManageRevoke] Databases to process: ${databases.length}`);

    let totalScanned = 0;
    let totalMatched = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const dbName of databases) {
      try {
        const result = await processDatabase(connection, dbName);
        totalScanned += result.scanned;
        totalMatched += result.matched;
        totalUpdated += result.updated;
        if (result.skipped) {
          totalSkipped += 1;
          console.log(`[VoucherManageRevoke] ${dbName}: skipped (${result.reason})`);
          continue;
        }
        console.log(`[VoucherManageRevoke] ${dbName}: scanned=${result.scanned} matched=${result.matched} updated=${result.updated}`);
        for (const row of result.rows) {
          const preset = row.rolePresetKey ? ` preset=${row.rolePresetKey}` : '';
          console.log(`[VoucherManageRevoke]   - ${dbName}.users id=${row.pk} username=${row.username} role=${row.role}${preset}`);
        }
      } catch (error) {
        totalSkipped += 1;
        console.warn(`[VoucherManageRevoke] ${dbName}: failed (${error.message})`);
      }
    }

    console.log(`[VoucherManageRevoke] Complete: scanned=${totalScanned} matched=${totalMatched} updated=${totalUpdated} skipped_dbs=${totalSkipped}`);
    if (!APPLY && totalMatched > 0) {
      console.log('[VoucherManageRevoke] Dry run only -- nothing was written. Re-run with --apply to revoke the rows listed above.');
    }
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error('[VoucherManageRevoke] Fatal error:', error);
  process.exitCode = 1;
});
