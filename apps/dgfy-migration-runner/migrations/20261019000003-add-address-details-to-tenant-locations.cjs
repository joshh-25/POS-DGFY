'use strict';

// #2595: the merchant's own street number, unit, floor or building for a store location, kept
// apart from the geocoded location so the store-location picker can edit both parts.
// `address_line` keeps the full display address (`<details>, <location>`), so every existing
// reader is unchanged. Additive and nullable with no backfill: locations saved before this column
// have no details. tenant_locations is tenant-scoped, so the column is applied to the landlord
// connection and every active tenant schema, exactly like
// 20260923000002-add-dine-in-pay-at-store-to-tenant-locations.cjs; sync-tenant-schemas.js carries
// the same column for tenants this migration does not reach.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const TENANT_LOCATIONS_TABLE = 'tenant_locations';
const COLUMN_NAME = 'address_details';
const COLUMN_DDL = "VARCHAR(255) NULL COMMENT 'Merchant-entered street number, unit, floor or building (#2595)' AFTER `address_line`";

const quoteIdentifier = (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) throw new Error(`Unsafe database identifier: ${identifier}`);
  return `\`${normalized}\``;
};

const getCurrentDatabaseName = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
  return rows?.[0]?.dbName || null;
};

const tableExists = async (queryInterface, databaseName, tableName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    { replacements: [databaseName, tableName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const columnExists = async (queryInterface, databaseName, tableName, columnName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    { replacements: [databaseName, tableName, columnName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
  if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
  const [rows] = await queryInterface.sequelize.query(
    "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
  );
  return rows.map((row) => String(row?.db_name || '').trim()).filter(Boolean);
};

const listTargetDatabases = async (queryInterface) => {
  const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
  if (!currentDatabaseName) return [];
  const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
  return [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
};

module.exports = {
  async up(queryInterface) {
    for (const databaseName of await listTargetDatabases(queryInterface)) {
      if (!(await tableExists(queryInterface, databaseName, TENANT_LOCATIONS_TABLE))
        || await columnExists(queryInterface, databaseName, TENANT_LOCATIONS_TABLE, COLUMN_NAME)) {
        continue;
      }
      await queryInterface.sequelize.query(
        `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TENANT_LOCATIONS_TABLE)} ADD COLUMN ${quoteIdentifier(COLUMN_NAME)} ${COLUMN_DDL}`
      );
    }
  },

  async down(queryInterface) {
    for (const databaseName of await listTargetDatabases(queryInterface)) {
      if (!(await tableExists(queryInterface, databaseName, TENANT_LOCATIONS_TABLE))
        || !(await columnExists(queryInterface, databaseName, TENANT_LOCATIONS_TABLE, COLUMN_NAME))) {
        continue;
      }
      await queryInterface.sequelize.query(
        `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TENANT_LOCATIONS_TABLE)} DROP COLUMN ${quoteIdentifier(COLUMN_NAME)}`
      );
    }
  }
};
