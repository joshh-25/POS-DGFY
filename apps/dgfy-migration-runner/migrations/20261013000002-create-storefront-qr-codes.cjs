'use strict';

// Storefront QR codes are tenant-local because a code belongs to a branch and
// must resolve against that tenant's catalog. The migration runner connects to
// the landlord database, so fan out the additive table to every active tenant
// database as well as the landlord database used by local development.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const TABLE_NAME = 'storefront_qr_codes';

const quoteIdentifier = (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }
  return `\`${normalized}\``;
};

const getCurrentDatabaseName = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
  return String(rows?.[0]?.dbName || '').trim();
};

const tableExists = async (queryInterface, databaseName, tableName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    { replacements: [databaseName, tableName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const indexExists = async (queryInterface, databaseName, tableName, indexName) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
    { replacements: [databaseName, tableName, indexName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
  if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
  const [rows] = await queryInterface.sequelize.query(
    "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
  );
  return rows
    .map((row) => String(row?.db_name || '').trim())
    .filter((name) => SAFE_IDENTIFIER_PATTERN.test(name));
};

const databasesForMigration = async (queryInterface) => {
  const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
  if (!currentDatabaseName) return [];
  const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
  return [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
};

const createTableSql = (databaseName) => `
  CREATE TABLE IF NOT EXISTS ${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE_NAME)} (
    ${quoteIdentifier('storefront_qr_code_id')} INT NOT NULL AUTO_INCREMENT,
    ${quoteIdentifier('public_token')} VARCHAR(64) NOT NULL,
    ${quoteIdentifier('location_id')} INT NOT NULL,
    ${quoteIdentifier('target_type')} VARCHAR(20) NOT NULL DEFAULT 'catalog',
    ${quoteIdentifier('folder_id')} INT NULL,
    ${quoteIdentifier('label')} VARCHAR(120) NULL,
    ${quoteIdentifier('design')} JSON NULL,
    ${quoteIdentifier('is_active')} TINYINT(1) NOT NULL DEFAULT 1,
    ${quoteIdentifier('created_by')} INT NULL,
    ${quoteIdentifier('updated_by')} INT NULL,
    ${quoteIdentifier('created_at')} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ${quoteIdentifier('updated_at')} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (${quoteIdentifier('storefront_qr_code_id')}),
    UNIQUE KEY ${quoteIdentifier('uq_storefront_qr_codes_public_token')} (${quoteIdentifier('public_token')}),
    KEY ${quoteIdentifier('idx_storefront_qr_codes_location_active')} (${quoteIdentifier('location_id')}, ${quoteIdentifier('is_active')}),
    KEY ${quoteIdentifier('idx_storefront_qr_codes_target')} (${quoteIdentifier('location_id')}, ${quoteIdentifier('target_type')}, ${quoteIdentifier('folder_id')}),
    CONSTRAINT ${quoteIdentifier('fk_storefront_qr_codes_location')} FOREIGN KEY (${quoteIdentifier('location_id')})
      REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('tenant_locations')} (${quoteIdentifier('location_id')})
      ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT ${quoteIdentifier('fk_storefront_qr_codes_folder')} FOREIGN KEY (${quoteIdentifier('folder_id')})
      REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('item_folders')} (${quoteIdentifier('folder_id')})
      ON DELETE SET NULL ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
`;

const addIndexIfMissing = async (queryInterface, databaseName, indexName, columns) => {
  if (await indexExists(queryInterface, databaseName, TABLE_NAME, indexName)) return;
  const qualifiedTable = `${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE_NAME)}`;
  await queryInterface.sequelize.query(
    `ALTER TABLE ${qualifiedTable} ADD INDEX ${quoteIdentifier(indexName)} (${columns.map(quoteIdentifier).join(', ')})`
  );
};

module.exports = {
  async up(queryInterface) {
    for (const databaseName of await databasesForMigration(queryInterface)) {
      const hasLocations = await tableExists(queryInterface, databaseName, 'tenant_locations');
      const hasFolders = await tableExists(queryInterface, databaseName, 'item_folders');
      if (!hasLocations || !hasFolders) continue;

      await queryInterface.sequelize.query(createTableSql(databaseName));
      await addIndexIfMissing(queryInterface, databaseName, 'idx_storefront_qr_codes_location_active', ['location_id', 'is_active']);
      await addIndexIfMissing(queryInterface, databaseName, 'idx_storefront_qr_codes_target', ['location_id', 'target_type', 'folder_id']);
    }
  },

  async down(queryInterface) {
    for (const databaseName of await databasesForMigration(queryInterface)) {
      if (!(await tableExists(queryInterface, databaseName, TABLE_NAME))) continue;
      await queryInterface.sequelize.query(
        `DROP TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE_NAME)}`
      );
    }
  }
};
