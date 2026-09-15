'use strict';

// Phase 334 (#1887): courier cash custody is a tenant-local operational ledger. The standalone
// migration runner connects to the landlord database, so this migration fans out across the
// landlord and every active tenant database, matching the current delivery-run evidence pattern.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const REMITTANCE_TABLE = 'delivery_run_remittances';
const ALLOCATION_TABLE = 'delivery_run_remittance_allocations';
const VARIANCE_TABLE = 'delivery_run_remittance_variances';

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

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
  if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
  const [rows] = await queryInterface.sequelize.query(
    "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
  );
  return rows
    .map((row) => String(row?.db_name || '').trim())
    .filter((name) => SAFE_IDENTIFIER_PATTERN.test(name));
};

const databaseNames = async (queryInterface) => {
  const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
  if (!currentDatabaseName) return [];
  const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
  return [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
};

const createRemittanceTable = (databaseName) => `
  CREATE TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(REMITTANCE_TABLE)} (
    ${quoteIdentifier('delivery_run_remittance_id')} INT NOT NULL AUTO_INCREMENT,
    ${quoteIdentifier('delivery_run_id')} INT NOT NULL,
    ${quoteIdentifier('location_id')} INT NOT NULL,
    ${quoteIdentifier('confirmed_by')} INT NOT NULL,
    ${quoteIdentifier('confirmed_at')} DATETIME NOT NULL,
    ${quoteIdentifier('total_expected_amount')} DECIMAL(14,4) NOT NULL,
    ${quoteIdentifier('total_remitted_amount')} DECIMAL(14,4) NOT NULL,
    ${quoteIdentifier('total_variance_amount')} DECIMAL(14,4) NOT NULL DEFAULT 0,
    ${quoteIdentifier('created_at')} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ${quoteIdentifier('updated_at')} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (${quoteIdentifier('delivery_run_remittance_id')}),
    UNIQUE KEY ${quoteIdentifier('uq_delivery_run_remittances_run')} (${quoteIdentifier('delivery_run_id')}),
    KEY ${quoteIdentifier('idx_delivery_run_remittances_location_confirmed')} (${quoteIdentifier('location_id')},${quoteIdentifier('confirmed_at')}),
    CONSTRAINT ${quoteIdentifier('fk_delivery_run_remittances_run')} FOREIGN KEY (${quoteIdentifier('delivery_run_id')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('delivery_runs')} (${quoteIdentifier('delivery_run_id')}) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ${quoteIdentifier('fk_delivery_run_remittances_location')} FOREIGN KEY (${quoteIdentifier('location_id')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('tenant_locations')} (${quoteIdentifier('location_id')}) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ${quoteIdentifier('fk_delivery_run_remittances_confirmed_by')} FOREIGN KEY (${quoteIdentifier('confirmed_by')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('users')} (${quoteIdentifier('user_id')}) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
`;

const createAllocationTable = (databaseName) => `
  CREATE TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(ALLOCATION_TABLE)} (
    ${quoteIdentifier('delivery_run_remittance_allocation_id')} INT NOT NULL AUTO_INCREMENT,
    ${quoteIdentifier('delivery_run_remittance_id')} INT NOT NULL,
    ${quoteIdentifier('pos_transaction_id')} INT NOT NULL,
    ${quoteIdentifier('delivery_personnel_id')} INT NULL,
    ${quoteIdentifier('delivery_personnel_name')} VARCHAR(255) NULL,
    ${quoteIdentifier('expected_amount')} DECIMAL(14,4) NOT NULL,
    ${quoteIdentifier('remitted_amount')} DECIMAL(14,4) NOT NULL,
    ${quoteIdentifier('variance_amount')} DECIMAL(14,4) NOT NULL DEFAULT 0,
    ${quoteIdentifier('created_at')} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (${quoteIdentifier('delivery_run_remittance_allocation_id')}),
    UNIQUE KEY ${quoteIdentifier('uq_delivery_run_remittance_allocations_transaction')} (${quoteIdentifier('delivery_run_remittance_id')},${quoteIdentifier('pos_transaction_id')}),
    KEY ${quoteIdentifier('idx_delivery_run_remittance_allocations_transaction')} (${quoteIdentifier('pos_transaction_id')}),
    CONSTRAINT ${quoteIdentifier('fk_delivery_run_remittance_allocations_remittance')} FOREIGN KEY (${quoteIdentifier('delivery_run_remittance_id')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier(REMITTANCE_TABLE)} (${quoteIdentifier('delivery_run_remittance_id')}) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ${quoteIdentifier('fk_delivery_run_remittance_allocations_transaction')} FOREIGN KEY (${quoteIdentifier('pos_transaction_id')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('pos_transactions')} (${quoteIdentifier('pos_transaction_id')}) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ${quoteIdentifier('fk_delivery_run_remittance_allocations_personnel')} FOREIGN KEY (${quoteIdentifier('delivery_personnel_id')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('delivery_personnel')} (${quoteIdentifier('delivery_personnel_id')}) ON DELETE SET NULL ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
`;

const createVarianceTable = (databaseName) => `
  CREATE TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(VARIANCE_TABLE)} (
    ${quoteIdentifier('delivery_run_remittance_variance_id')} INT NOT NULL AUTO_INCREMENT,
    ${quoteIdentifier('delivery_run_remittance_allocation_id')} INT NOT NULL,
    ${quoteIdentifier('entry_type')} ENUM('original','reversal') NOT NULL,
    ${quoteIdentifier('reversal_of_variance_id')} INT NULL,
    ${quoteIdentifier('direction')} ENUM('shortage','overage') NOT NULL,
    ${quoteIdentifier('amount')} DECIMAL(14,4) NOT NULL,
    ${quoteIdentifier('reason')} TEXT NOT NULL,
    ${quoteIdentifier('recorded_by')} INT NOT NULL,
    ${quoteIdentifier('recorded_at')} DATETIME NOT NULL,
    PRIMARY KEY (${quoteIdentifier('delivery_run_remittance_variance_id')}),
    KEY ${quoteIdentifier('idx_delivery_run_remittance_variances_allocation')} (${quoteIdentifier('delivery_run_remittance_allocation_id')}),
    KEY ${quoteIdentifier('idx_delivery_run_remittance_variances_reversal')} (${quoteIdentifier('reversal_of_variance_id')}),
    CONSTRAINT ${quoteIdentifier('fk_delivery_run_remittance_variances_allocation')} FOREIGN KEY (${quoteIdentifier('delivery_run_remittance_allocation_id')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier(ALLOCATION_TABLE)} (${quoteIdentifier('delivery_run_remittance_allocation_id')}) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ${quoteIdentifier('fk_delivery_run_remittance_variances_reversal')} FOREIGN KEY (${quoteIdentifier('reversal_of_variance_id')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier(VARIANCE_TABLE)} (${quoteIdentifier('delivery_run_remittance_variance_id')}) ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT ${quoteIdentifier('fk_delivery_run_remittance_variances_recorded_by')} FOREIGN KEY (${quoteIdentifier('recorded_by')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('users')} (${quoteIdentifier('user_id')}) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
`;

module.exports = {
  async up(queryInterface) {
    for (const databaseName of await databaseNames(queryInterface)) {
      const requiredTables = [
        'delivery_runs',
        'tenant_locations',
        'users',
        'pos_transactions',
        'delivery_personnel'
      ];
      const hasRequiredTables = (await Promise.all(
        requiredTables.map((tableName) => tableExists(queryInterface, databaseName, tableName))
      )).every(Boolean);
      if (!hasRequiredTables) continue;

      if (!(await tableExists(queryInterface, databaseName, REMITTANCE_TABLE))) {
        await queryInterface.sequelize.query(createRemittanceTable(databaseName));
      }
      if (!(await tableExists(queryInterface, databaseName, ALLOCATION_TABLE))) {
        await queryInterface.sequelize.query(createAllocationTable(databaseName));
      }
      if (!(await tableExists(queryInterface, databaseName, VARIANCE_TABLE))) {
        await queryInterface.sequelize.query(createVarianceTable(databaseName));
      }
    }
  },

  async down(queryInterface) {
    for (const databaseName of await databaseNames(queryInterface)) {
      for (const tableName of [VARIANCE_TABLE, ALLOCATION_TABLE, REMITTANCE_TABLE]) {
        if (await tableExists(queryInterface, databaseName, tableName)) {
          await queryInterface.sequelize.query(
            `DROP TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}`
          );
        }
      }
    }
  }
};
