'use strict';

// Phase 240 (#1331, epic #1321 decision 9). The `free_delivery` voucher benefit class, code-entered.
// Combines, in one migration, one tenant fan-out pass (matching Phase 237's own "five columns, one
// file" shape):
//
//   1. Two ENUM MODIFY widenings on `vouchers` -- `voucher_kind` gains 'delivery_campaign',
//      `benefit_class` gains 'free_delivery'. Appended LAST in both enums -- MySQL stores ENUM
//      ordinals, and inserting mid-list would silently reinterpret every existing voucher row
//      across every tenant DB. Structural template: 20260830000003-add-cheque-payment-method.cjs
//      (the enum-widening precedent -- MODIFY COLUMN, both up and down, tenant fan-out, and the
//      loud-failure-over-silent-financial-data-mutation posture on rollback).
//   2. Two additive columns on `vouchers` -- `benefit_target` (the items/delivery axis Phase 239's
//      voucherBenefitPolicy.js was already built expecting) and `delivery_amount_off_centavos`
//      (the free_delivery benefit's own amount; NULL means "waive the whole fee").
//   3. Two additive columns on `pos_transactions` -- `delivery_fee_waiver_voucher_id` (FK to
//      `vouchers`, ON DELETE SET NULL) and `delivery_fee_waiver_label_snapshot`. Reuses the
//      EXISTING `pos_transactions.delivery_fee_waiver` amount column shipped by Phase 237
//      (20260903000001-add-delivery-fee-breakdown.cjs) rather than adding a second one -- see the
//      Phase 240 plan §0.2/§2.2 for why a duplicate amount column would break Phase 237's own
//      `delivery_fee_base - delivery_fee_waiver === delivery_fee` reconciliation invariant.
//
// `apps/dgfy-migration-runner` only ever connects to the landlord DB -- both `vouchers` and
// `pos_transactions` are tenant-scoped, so this migration fans out over every active tenant
// database itself, exactly as 20260903000001/20260830000003 already do: same tenant-discovery
// query, same idempotence guards (columnExists for the additive columns), same
// additive/reversible-where-possible shape.
//
// `apps/dgfy-api/scripts/sync-tenant-schemas.js` is kept in lockstep in the SAME commit
// (REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers / .pos_transactions, AND the REQUIRED_TENANT_SCHEMA_TABLES
// .vouchers CREATE TABLE fallback -- the two ENUM widenings are NOT column-repairable by the
// column-presence-only mechanism the other four columns use, so the CREATE TABLE string is edited
// directly; see that file's own comment on this), so a tenant that misses this migration, or is
// restored from an older snapshot, self-repairs at API boot -- the #860/#639 crash-loop-prevention
// mechanism.
//
// FK ordering note: `delivery_fee_waiver_voucher_id`'s constraint references `vouchers`, tenant-
// local. Safe to add unconditionally here (guarded only by `tableExists(..., 'vouchers')`, not a
// second FK-target existence check) because `vouchers` is itself a REQUIRED_TENANT_SCHEMA_TABLES
// entry and this repo's own tenant-repair driver always creates missing tables before repairing
// missing columns -- the identical reasoning already documented for `vouchers.pricelist_id`'s own
// inline FK in sync-tenant-schemas.js. A tenant DB missing `vouchers` entirely (pre-#455) is
// guarded by `tableExists` below regardless.
//
// rollback_note: the four additive columns (`vouchers.benefit_target`,
// `vouchers.delivery_amount_off_centavos`, `pos_transactions.delivery_fee_waiver_voucher_id`,
// `pos_transactions.delivery_fee_waiver_label_snapshot`) are nullable/defaulted and droppable at
// the schema level with no data-loss beyond their own provenance. The two ENUM widenings are NOT
// cleanly reversible once any delivery voucher has been authored -- an ordinal reverse-MODIFY would
// truncate/error on any `voucher_kind = 'delivery_campaign'` or `benefit_class = 'free_delivery'`
// row under strict mode. `down()` therefore checks for such rows first and throws rather than
// silently truncating financial/campaign configuration data, the same posture
// 20260830000003-add-cheque-payment-method.cjs already established for its own enum widening.
// Orders already persisted with a non-zero `delivery_fee_waiver` are NOT recomputed by a revert --
// the fee they carry is correct for the money actually collected; only the two new attribution
// columns become unreadable. `down()` runs the column drops BEFORE the enum narrowing, since a
// still-present `free_delivery` row would itself block the narrowing.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

const VOUCHERS_TABLE = 'vouchers';
const POS_TRANSACTIONS_TABLE = 'pos_transactions';

const VOUCHER_KIND_ENUM = "'promo_code','delivery_campaign'";
const PREVIOUS_VOUCHER_KIND_ENUM = "'promo_code'";

const BENEFIT_CLASS_ENUM = "'percent_off','amount_off','fixed_price','free_delivery'";
const PREVIOUS_BENEFIT_CLASS_ENUM = "'percent_off','amount_off','fixed_price'";

const WIDENED_VOUCHER_ENUM_COLUMNS = [
  {
    column: 'voucher_kind',
    enumValues: VOUCHER_KIND_ENUM,
    previousEnumValues: PREVIOUS_VOUCHER_KIND_ENUM,
    defaultClause: " DEFAULT 'promo_code'",
    newValue: 'delivery_campaign'
  },
  {
    column: 'benefit_class',
    enumValues: BENEFIT_CLASS_ENUM,
    previousEnumValues: PREVIOUS_BENEFIT_CLASS_ENUM,
    defaultClause: '',
    newValue: 'free_delivery'
  }
];

const NEW_VOUCHER_COLUMNS = [
  { name: 'benefit_target', ddl: "ENUM('items','delivery') NOT NULL DEFAULT 'items'" },
  { name: 'delivery_amount_off_centavos', ddl: 'BIGINT NULL DEFAULT NULL' }
];

const NEW_POS_TRANSACTION_COLUMNS = [
  {
    name: 'delivery_fee_waiver_voucher_id',
    ddl: 'INT NULL',
    // Added as a second statement inside the same ADD COLUMN's ALTER TABLE, guarded separately by
    // tableExists(vouchers) below -- see the FK ordering note above.
    fkClause: 'ADD CONSTRAINT `fk_pos_transactions_delivery_fee_waiver_voucher` FOREIGN KEY (`delivery_fee_waiver_voucher_id`) REFERENCES `vouchers` (`voucher_id`) ON DELETE SET NULL'
  },
  { name: 'delivery_fee_waiver_label_snapshot', ddl: 'VARCHAR(255) NULL' }
];

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

const addColumnIfMissing = async (queryInterface, databaseName, tableName, { name, ddl }) => {
  if (await columnExists(queryInterface, databaseName, tableName, name)) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}
    ADD COLUMN ${quoteIdentifier(name)} ${ddl}
  `);
};

const dropColumnIfPresent = async (queryInterface, databaseName, tableName, { name }) => {
  if (!(await columnExists(queryInterface, databaseName, tableName, name))) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}
    DROP COLUMN ${quoteIdentifier(name)}
  `);
};

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (await tableExists(queryInterface, databaseName, VOUCHERS_TABLE)) {
        // Enum widenings first (MODIFY is naturally idempotent -- a re-run sets the same
        // definition), then the two additive columns.
        for (const spec of WIDENED_VOUCHER_ENUM_COLUMNS) {
          await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(VOUCHERS_TABLE)}
            MODIFY COLUMN ${quoteIdentifier(spec.column)} ENUM(${spec.enumValues}) NOT NULL${spec.defaultClause}
          `);
        }
        for (const spec of NEW_VOUCHER_COLUMNS) {
          await addColumnIfMissing(queryInterface, databaseName, VOUCHERS_TABLE, spec);
        }
      }

      if (await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE)) {
        for (const spec of NEW_POS_TRANSACTION_COLUMNS) {
          if (await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, spec.name)) continue;
          const fkExtra = spec.fkClause && (await tableExists(queryInterface, databaseName, VOUCHERS_TABLE))
            ? `, ${spec.fkClause}`
            : '';
          await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
            ADD COLUMN ${quoteIdentifier(spec.name)} ${spec.ddl}${fkExtra}
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
      // Column drops BEFORE enum narrowing -- see this file's own rollback_note. A still-present
      // free_delivery row would itself block the narrowing below, and dropping the attribution
      // columns first costs nothing regardless of whether the narrowing ends up throwing.
      if (await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE)) {
        for (const spec of NEW_POS_TRANSACTION_COLUMNS) {
          await dropColumnIfPresent(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, spec);
        }
      }

      if (!(await tableExists(queryInterface, databaseName, VOUCHERS_TABLE))) continue;

      for (const spec of NEW_VOUCHER_COLUMNS) {
        await dropColumnIfPresent(queryInterface, databaseName, VOUCHERS_TABLE, spec);
      }

      for (const spec of WIDENED_VOUCHER_ENUM_COLUMNS) {
        const [rows] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) AS count FROM ${quoteIdentifier(databaseName)}.${quoteIdentifier(VOUCHERS_TABLE)} WHERE ${quoteIdentifier(spec.column)} = ?`,
          { replacements: [spec.newValue] }
        );
        if (Number(rows?.[0]?.count || 0) > 0) {
          // Loud failure over silent financial/campaign-data mutation -- same posture as the
          // cheque-tender precedent (20260830000003). A tenant with an authored delivery voucher
          // cannot roll back this migration; the code revert alone (leaving the enums widened) is
          // harmless and is the correct rollback path in that case instead.
          throw new Error(`Cannot roll back ${spec.column} widening while ${databaseName}.${VOUCHERS_TABLE} contains a '${spec.newValue}' row`);
        }
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(VOUCHERS_TABLE)}
          MODIFY COLUMN ${quoteIdentifier(spec.column)} ENUM(${spec.previousEnumValues}) NOT NULL${spec.defaultClause}
        `);
      }
    }
  }
};
