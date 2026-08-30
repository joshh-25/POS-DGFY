'use strict';

// Phase 210 (#1179). Two additive pieces, both on TENANT tables (PHASE_210_PLAN.md section 5):
//
// 1. Three nullable columns on `pos_transactions` -- rejection_reason/rejected_by/rejected_at --
//    so a store-initiated reject's stated reason survives durably instead of only living as long
//    as the refund note it happened to be attached to.
// 2. A new append-only audit table, `pos_order_address_changes`, recording every staff
//    delivery-address/pin edit (who, when, from what, to what, why).
//
// `apps/dgfy-migration-runner` only ever connects to the landlord DB (this app's own README) --
// both `pos_transactions` and the new table are tenant-scoped, so this migration fans out over
// every active tenant database itself, exactly like 20260831000001-add-pos-order-payment-proof-
// columns.cjs (the template this file mirrors verbatim in structure). Skipping the fan-out is the
// #860/#639 crash-loop class (docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md).
// `apps/dgfy-api/scripts/sync-tenant-schemas.js` is kept in lockstep in the same commit
// (REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions + REQUIRED_TENANT_SCHEMA_TABLES.
// pos_order_address_changes + REQUIRED_TENANT_SCHEMA_INDEXES), so a tenant that misses this
// migration, or is restored from an older snapshot, self-repairs at API boot, and a brand-new
// tenant is created correct.
//
// rollback_note: the three `pos_transactions` columns are nullable and additive, so dropping them
// is pure at the schema level. Dropping `pos_order_address_changes`, however, is genuinely
// destructive -- it PERMANENTLY DESTROYS the address-change audit trail (there is no other copy of
// `previous_address`/`previous_latitude`/`previous_longitude`). Unlike Phase 204's rollback_note,
// this down() is not purely additive-safe; only run it knowing that history is gone for good.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const POS_TRANSACTIONS_TABLE = 'pos_transactions';
const ADDRESS_CHANGES_TABLE = 'pos_order_address_changes';

const NEW_POS_TRANSACTION_COLUMNS = [
  { name: 'rejection_reason', ddl: 'VARCHAR(255) NULL AFTER `accepted_at`' },
  { name: 'rejected_by', ddl: 'INT NULL' },
  { name: 'rejected_at', ddl: 'DATETIME NULL' }
];

const REJECTED_BY_FK_NAME = 'fk_pos_transactions_rejected_by';
const ADDRESS_CHANGE_TRANSACTION_FK_NAME = 'fk_pos_order_address_changes_pos_transaction_id';
const ADDRESS_CHANGE_CHANGED_BY_FK_NAME = 'fk_pos_order_address_changes_changed_by';
const ADDRESS_CHANGE_INDEX_NAME = 'idx_pos_order_address_changes_transaction_changed_at';

const foreignKeyExists = async (queryInterface, databaseName, tableName, constraintName) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS count FROM information_schema.table_constraints
     WHERE table_schema = ? AND table_name = ? AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'`,
    { replacements: [databaseName, tableName, constraintName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const indexExists = async (queryInterface, databaseName, tableName, indexName) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS count FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
    { replacements: [databaseName, tableName, indexName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

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
      // 1. pos_transactions: three additive nullable columns + FK.
      if (await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE)) {
        for (const { name, ddl } of NEW_POS_TRANSACTION_COLUMNS) {
          if (await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, name)) continue;
          await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
            ADD COLUMN ${quoteIdentifier(name)} ${ddl}
          `);
        }

        if (
          (await tableExists(queryInterface, databaseName, 'users'))
          && !(await foreignKeyExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, REJECTED_BY_FK_NAME))
        ) {
          await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
            ADD CONSTRAINT ${quoteIdentifier(REJECTED_BY_FK_NAME)}
            FOREIGN KEY (${quoteIdentifier('rejected_by')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('users')} (${quoteIdentifier('user_id')}) ON DELETE SET NULL
          `);
        }
      }

      // 2. pos_order_address_changes: new table + its two FKs + its index.
      if (
        (await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))
        && !(await tableExists(queryInterface, databaseName, ADDRESS_CHANGES_TABLE))
      ) {
        await queryInterface.sequelize.query(`
          CREATE TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(ADDRESS_CHANGES_TABLE)} (
            \`address_change_id\` INT NOT NULL AUTO_INCREMENT,
            \`pos_transaction_id\` INT NOT NULL,
            \`previous_address\` TEXT NULL,
            \`previous_latitude\` DECIMAL(10,8) NULL,
            \`previous_longitude\` DECIMAL(11,8) NULL,
            \`new_address\` TEXT NOT NULL,
            \`new_latitude\` DECIMAL(10,8) NULL,
            \`new_longitude\` DECIMAL(11,8) NULL,
            \`change_reason\` VARCHAR(255) NOT NULL,
            \`changed_by\` INT NULL,
            \`changed_by_shift_id\` INT NULL,
            \`changed_at\` DATETIME NOT NULL,
            \`created_at\` DATETIME NOT NULL,
            \`updated_at\` DATETIME NOT NULL,
            PRIMARY KEY (\`address_change_id\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
      }

      if (await tableExists(queryInterface, databaseName, ADDRESS_CHANGES_TABLE)) {
        if (!(await foreignKeyExists(queryInterface, databaseName, ADDRESS_CHANGES_TABLE, ADDRESS_CHANGE_TRANSACTION_FK_NAME))) {
          await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(ADDRESS_CHANGES_TABLE)}
            ADD CONSTRAINT ${quoteIdentifier(ADDRESS_CHANGE_TRANSACTION_FK_NAME)}
            FOREIGN KEY (${quoteIdentifier('pos_transaction_id')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)} (${quoteIdentifier('pos_transaction_id')}) ON DELETE CASCADE
          `);
        }

        if (
          (await tableExists(queryInterface, databaseName, 'users'))
          && !(await foreignKeyExists(queryInterface, databaseName, ADDRESS_CHANGES_TABLE, ADDRESS_CHANGE_CHANGED_BY_FK_NAME))
        ) {
          await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(ADDRESS_CHANGES_TABLE)}
            ADD CONSTRAINT ${quoteIdentifier(ADDRESS_CHANGE_CHANGED_BY_FK_NAME)}
            FOREIGN KEY (${quoteIdentifier('changed_by')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('users')} (${quoteIdentifier('user_id')}) ON DELETE SET NULL
          `);
        }

        if (!(await indexExists(queryInterface, databaseName, ADDRESS_CHANGES_TABLE, ADDRESS_CHANGE_INDEX_NAME))) {
          await queryInterface.sequelize.query(`
            CREATE INDEX ${quoteIdentifier(ADDRESS_CHANGE_INDEX_NAME)}
            ON ${quoteIdentifier(databaseName)}.${quoteIdentifier(ADDRESS_CHANGES_TABLE)} (${quoteIdentifier('pos_transaction_id')}, ${quoteIdentifier('changed_at')})
          `);
        }
      }
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      // Drop FKs first, then the columns, then the table -- mirrors Phase 204's ordering.
      if (await tableExists(queryInterface, databaseName, ADDRESS_CHANGES_TABLE)) {
        if (await foreignKeyExists(queryInterface, databaseName, ADDRESS_CHANGES_TABLE, ADDRESS_CHANGE_TRANSACTION_FK_NAME)) {
          await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(ADDRESS_CHANGES_TABLE)}
            DROP FOREIGN KEY ${quoteIdentifier(ADDRESS_CHANGE_TRANSACTION_FK_NAME)}
          `);
        }
        if (await foreignKeyExists(queryInterface, databaseName, ADDRESS_CHANGES_TABLE, ADDRESS_CHANGE_CHANGED_BY_FK_NAME)) {
          await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(ADDRESS_CHANGES_TABLE)}
            DROP FOREIGN KEY ${quoteIdentifier(ADDRESS_CHANGE_CHANGED_BY_FK_NAME)}
          `);
        }
        // Destroys the address-change audit trail permanently -- see rollback_note above.
        await queryInterface.sequelize.query(`
          DROP TABLE IF EXISTS ${quoteIdentifier(databaseName)}.${quoteIdentifier(ADDRESS_CHANGES_TABLE)}
        `);
      }

      if (await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE)) {
        if (await foreignKeyExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, REJECTED_BY_FK_NAME)) {
          await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
            DROP FOREIGN KEY ${quoteIdentifier(REJECTED_BY_FK_NAME)}
          `);
        }

        for (const { name } of NEW_POS_TRANSACTION_COLUMNS) {
          if (!(await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, name))) continue;
          await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
            DROP COLUMN ${quoteIdentifier(name)}
          `);
        }
      }
    }
  }
};
