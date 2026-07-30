'use strict';

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;

const quoteIdentifier = (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }
  return `\`${normalized}\``;
};

const getCurrentDatabaseName = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
  return rows?.[0]?.dbName || null;
};

const tableExists = async (queryInterface, databaseName, tableName) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?`,
    { replacements: [databaseName, tableName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
  if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];

  const [rows] = await queryInterface.sequelize.query(
    `SELECT DISTINCT db_name
     FROM tenants
     WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''`
  );

  return rows
    .map((row) => String(row?.db_name || '').trim())
    .filter(Boolean);
};

const promoteLegacyPosBarcodes = async (queryInterface, databaseName, scope) => {
  if (!(await tableExists(queryInterface, databaseName, 'item_barcodes'))) return;

  await queryInterface.sequelize.query(`
    UPDATE ${quoteIdentifier(databaseName)}.\`item_barcodes\`
    SET scope = :scope
    WHERE is_active = 1
      AND scope = :previousScope
      AND source = 'tenant_generated'
      AND code LIKE 'IMS-%-INVENTORY-%'
  `, {
    replacements: {
      scope,
      previousScope: scope === 'pos' ? 'inventory' : 'pos'
    }
  });
};

module.exports = {
  async up(queryInterface) {
    // Earlier POS-visible items received a tenant-generated inventory barcode.
    // POS already accepts the same code after it is explicitly scoped for POS;
    // this preserves the barcode value and inventory use while repairing its
    // incorrectly restrictive legacy scope.
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;

    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    const databaseNames = [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
    for (const databaseName of databaseNames) {
      await promoteLegacyPosBarcodes(queryInterface, databaseName, 'pos');
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;

    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    const databaseNames = [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
    for (const databaseName of databaseNames) {
      await promoteLegacyPosBarcodes(queryInterface, databaseName, 'inventory');
    }
  }
};
