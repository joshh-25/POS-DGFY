'use strict';

// Phase 141 (#822) -- ADR 0069 clause 1b [binding] (carried forward by ADR 0070): the session must
// store and authorize the downpayment amount, not the order total. Today total_amount_centavos
// means both "the order total" and "the amount authorized" -- this migration splits those two
// facts apart so a downpayment session can express "authorized less than the order is worth"
// without ambiguity. Purely additive, same shape as 20260608000001-add-fee-policy-to-commerce-
// payment-sessions.cjs. DEFAULT 'full' on capture_kind makes every pre-existing row correct by
// construction -- a session created before this phase always captured the full order total.
//
// total_amount_centavos itself is UNCHANGED by this migration and keeps meaning "the amount
// actually authorized/captured" -- that's what makes the platform-fee guard, the webhook
// exact-amount-equality check, and the reject-refund path all fall out correctly for a downpayment
// session with zero code change to those three call sites (see the Phase 141 plan).
//
// Landlord-only table (commerce_payment_sessions has no tenant-DB counterpart -- see
// scripts/sync-tenant-schemas.js, which does not register it), so this migration carries no
// deploy-order dependency on docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md's open entries.

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => (typeof table === 'object' ? table.tableName : table)).includes(tableName);
};

const hasColumn = async (queryInterface, tableName, columnName) => {
  if (!await tableExists(queryInterface, tableName)) return false;
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
};

const TABLE = 'commerce_payment_sessions';

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, TABLE)) return;

    if (!await hasColumn(queryInterface, TABLE, 'capture_kind')) {
      await queryInterface.addColumn(TABLE, 'capture_kind', {
        type: Sequelize.ENUM('full', 'downpayment'),
        allowNull: false,
        defaultValue: 'full'
      });
    }
    if (!await hasColumn(queryInterface, TABLE, 'order_total_centavos')) {
      await queryInterface.addColumn(TABLE, 'order_total_centavos', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }
    if (!await hasColumn(queryInterface, TABLE, 'capture_payment_method')) {
      await queryInterface.addColumn(TABLE, 'capture_payment_method', {
        type: Sequelize.STRING(40),
        allowNull: true
      });
    }
    if (!await hasColumn(queryInterface, TABLE, 'downpayment_refundable')) {
      await queryInterface.addColumn(TABLE, 'downpayment_refundable', {
        type: Sequelize.BOOLEAN,
        allowNull: true
      });
    }

    // Backfill order_total_centavos for every pre-existing row: before this phase every session
    // captured the full order total, so order_total_centavos === total_amount_centavos for all of
    // them. Only rows where the default 0 is still sitting (i.e. every existing row) are touched.
    await queryInterface.sequelize.query(`
      UPDATE ${TABLE}
      SET order_total_centavos = total_amount_centavos
      WHERE order_total_centavos = 0
    `);
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, TABLE)) return;

    if (await hasColumn(queryInterface, TABLE, 'downpayment_refundable')) {
      await queryInterface.removeColumn(TABLE, 'downpayment_refundable');
    }
    if (await hasColumn(queryInterface, TABLE, 'capture_payment_method')) {
      await queryInterface.removeColumn(TABLE, 'capture_payment_method');
    }
    if (await hasColumn(queryInterface, TABLE, 'order_total_centavos')) {
      await queryInterface.removeColumn(TABLE, 'order_total_centavos');
    }
    if (await hasColumn(queryInterface, TABLE, 'capture_kind')) {
      await queryInterface.removeColumn(TABLE, 'capture_kind');
    }
  }
};
