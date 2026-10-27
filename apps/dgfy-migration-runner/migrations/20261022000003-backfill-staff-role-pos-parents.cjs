'use strict';

// The permission dependency graph now requires POS shift operations to inherit both
// pos:shift_access and its pos:view parent. Existing staff-role capability JSON was
// created before those parents were enforced, so repair only the missing parents for
// roles that already carry an approved shift/cash capability. This migration never
// grants a new operational child capability and is safe to rerun.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const MIGRATION_TAG = '20261022000003-backfill-staff-role-pos-parents';
const SHIFT_CAPABILITIES = new Set([
  'pos:shift_access',
  'pos:shift_close',
  'pos:close_day',
  'pos:cash_drawer_adjust',
  'pos:shift_force_close',
  'pos:fiscal_terminals:manage',
  'pos:esales:manage',
  'pos:switch_location',
  'pos:employees:manage'
]);

const quoteIdentifier = (value) => {
  const normalized = String(value || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) throw new Error(`Unsafe database identifier: ${value}`);
  return `\`${normalized}\``;
};

const databaseName = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
  return String(rows?.[0]?.dbName || '').trim();
};

const tableExists = async (queryInterface, database, table, options = {}) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    { replacements: [database, table], ...options }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const activeTenantDatabases = async (queryInterface, landlord) => {
  if (!(await tableExists(queryInterface, landlord, 'tenants'))) return [];
  const [rows] = await queryInterface.sequelize.query(
    "SELECT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
  );
  return rows
    .map((row) => String(row?.db_name || '').trim())
    .filter((database) => SAFE_IDENTIFIER_PATTERN.test(database));
};

const normalizeCapabilities = (raw) => {
  let parsed = raw;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed
    .filter((capability) => typeof capability === 'string')
    .map((capability) => capability.trim())
    .filter(Boolean))];
};

const repairCapabilities = (capabilities) => {
  const next = [...capabilities];
  const hasShiftCapability = next.some((capability) => SHIFT_CAPABILITIES.has(capability));
  if (hasShiftCapability && !next.includes('pos:shift_access')) next.push('pos:shift_access');
  if (hasShiftCapability && !next.includes('pos:view')) next.push('pos:view');
  return next;
};

const migrateDatabase = async (queryInterface, database) => {
  const options = { transaction: null };
  if (!(await tableExists(queryInterface, database, 'staff_roles'))) return 0;

  const [roles] = await queryInterface.sequelize.query(
    `SELECT ${quoteIdentifier('staff_role_id')}, ${quoteIdentifier('capabilities')}
       FROM ${quoteIdentifier(database)}.${quoteIdentifier('staff_roles')}`
  );
  const repairs = roles
    .map((role) => {
      const previousCapabilities = normalizeCapabilities(role.capabilities);
      const capabilities = repairCapabilities(previousCapabilities);
      return {
        staffRoleId: role.staff_role_id,
        previousCapabilities,
        capabilities,
        addedCapabilities: capabilities.filter((capability) => !previousCapabilities.includes(capability))
      };
    })
    .filter((repair) => repair.addedCapabilities.length > 0);

  if (repairs.length === 0) return 0;

  const transaction = await queryInterface.sequelize.transaction();
  options.transaction = transaction;
  try {
    const hasAuditLogs = await tableExists(queryInterface, database, 'audit_logs', options);
    for (const repair of repairs) {
      await queryInterface.sequelize.query(
        `UPDATE ${quoteIdentifier(database)}.${quoteIdentifier('staff_roles')}
            SET ${quoteIdentifier('capabilities')} = ?
          WHERE ${quoteIdentifier('staff_role_id')} = ?`,
        { replacements: [JSON.stringify(repair.capabilities), repair.staffRoleId], transaction }
      );

      if (hasAuditLogs) {
        await queryInterface.sequelize.query(
          `INSERT INTO ${quoteIdentifier(database)}.${quoteIdentifier('audit_logs')}
            (${quoteIdentifier('user_id')}, ${quoteIdentifier('entity_type')}, ${quoteIdentifier('entity_id')}, ${quoteIdentifier('action')}, ${quoteIdentifier('changes')})
           VALUES (NULL, 'staff_role', ?, 'UPDATE', ?)`,
          {
            replacements: [repair.staffRoleId, JSON.stringify({
              migration: MIGRATION_TAG,
              previous_capabilities: repair.previousCapabilities,
              capabilities: repair.capabilities,
              added_capabilities: repair.addedCapabilities
            })],
            transaction
          }
        );
      }
    }
    await transaction.commit();
    return repairs.length;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

module.exports = {
  normalizeCapabilities,
  repairCapabilities,

  async up(queryInterface) {
    const landlord = await databaseName(queryInterface);
    if (!landlord) return;
    const tenantDatabases = await activeTenantDatabases(queryInterface, landlord);
    const databases = [...new Set([landlord, ...tenantDatabases])];
    let repairedRoles = 0;
    for (const database of databases) repairedRoles += await migrateDatabase(queryInterface, database);
    console.log(`[StaffRoleParentBackfill] repaired_roles=${repairedRoles} databases=${databases.length}`);
  },

  async down() {
    // Removing these parent capabilities would revoke access that a tenant may have
    // legitimately retained after the migration. Data backfills are intentionally not
    // reversed; a rollback must deploy the compatible resolver instead.
  }
};
