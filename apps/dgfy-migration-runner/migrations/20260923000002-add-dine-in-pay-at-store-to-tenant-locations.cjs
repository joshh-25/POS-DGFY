'use strict';

// Additive branch policy. tenant_locations is tenant-scoped, so apply the column to
// the landlord connection and every active tenant schema, matching the existing
// tenant-location repair migrations.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const TENANT_LOCATIONS_TABLE = 'tenant_locations';
const COLUMN_NAME = 'allow_dine_in_pay_at_store';
const COLUMN_DDL = "TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Per-location: customer may pay in store for dine-in'";

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

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
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
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
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
