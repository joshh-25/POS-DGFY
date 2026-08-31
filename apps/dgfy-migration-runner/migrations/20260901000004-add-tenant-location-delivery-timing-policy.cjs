'use strict';

// #1218: additive per-location delivery timing policy. tenant_locations is tenant-scoped, so
// fan out from the landlord connection; sync-tenant-schemas carries the same columns as repair.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const TENANT_LOCATIONS_TABLE = 'tenant_locations';
const NEW_TENANT_LOCATION_COLUMNS = [
  { name: 'scheduling_enabled', ddl: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Per-location: customer may pick a scheduled fulfillment date/time'" },
  { name: 'immediate_fulfillment_enabled', ddl: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Per-location: customer may choose immediate (NOW) fulfillment'" },
  { name: 'fulfillment_lead_time_min_days', ddl: "INT NULL COMMENT 'Merchant-set minimum fulfillment lead time in days; required when immediate_fulfillment_enabled = 0. No default by design (#1218)'" },
  { name: 'fulfillment_lead_time_max_days', ddl: "INT NULL COMMENT 'Merchant-set maximum fulfillment lead time in days; required when immediate_fulfillment_enabled = 0, must be >= min. No default by design (#1218)'" }
];

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
  const [rows] = await queryInterface.sequelize.query('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', { replacements: [databaseName, tableName] });
  return Number(rows?.[0]?.count || 0) > 0;
};
const columnExists = async (queryInterface, databaseName, tableName, columnName) => {
  const [rows] = await queryInterface.sequelize.query('SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?', { replacements: [databaseName, tableName, columnName] });
  return Number(rows?.[0]?.count || 0) > 0;
};
const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
  if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
  const [rows] = await queryInterface.sequelize.query("SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''");
  return rows.map((row) => String(row?.db_name || '').trim()).filter(Boolean);
};

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, TENANT_LOCATIONS_TABLE))) continue;
      for (const { name, ddl } of NEW_TENANT_LOCATION_COLUMNS) {
        if (await columnExists(queryInterface, databaseName, TENANT_LOCATIONS_TABLE, name)) continue;
        await queryInterface.sequelize.query(`ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TENANT_LOCATIONS_TABLE)} ADD COLUMN ${quoteIdentifier(name)} ${ddl}`);
      }
    }
  },
  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, TENANT_LOCATIONS_TABLE))) continue;
      for (const { name } of [...NEW_TENANT_LOCATION_COLUMNS].reverse()) {
        if (!(await columnExists(queryInterface, databaseName, TENANT_LOCATIONS_TABLE, name))) continue;
        await queryInterface.sequelize.query(`ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TENANT_LOCATIONS_TABLE)} DROP COLUMN ${quoteIdentifier(name)}`);
      }
    }
  }
};
