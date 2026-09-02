'use strict';

// Phase 237 (#1329, epic #1321, Wave 0 decision #2). One additive, nullable JSON column on the
// LANDLORD table `commerce_payment_sessions` -- the whole resolved delivery-fee breakdown, pinned at
// payment-session creation and read back by finalizePaidCommerceSession.js on webhook finalization
// (see resolveCheckoutContext's pinnedDeliveryBreakdown param). This is what keeps a finalized
// order's persisted fee identical to the amount PayMongo actually captured, even if settings or
// GraphHopper state changed between session creation and webhook finalization.
//
// `commerce_payment_sessions` is landlord-only (src/models/Landlord/CommercePaymentSession.js) --
// UNLIKE 20260903000001-add-delivery-fee-breakdown.cjs (tenant `pos_transactions`, fanned out per
// tenant DB), this is a plain single-database addColumn/removeColumn migration. No tenant fan-out,
// no apps/dgfy-api/scripts/sync-tenant-schemas.js entry -- that mechanism governs tenant schemas
// only. Mirrors 20260608000001-add-fee-policy-to-commerce-payment-sessions.cjs's structure exactly.
//
// rollback_note: additive and nullable, read by nothing else in this diff -- dropping it is pure at
// the schema level. NULL for every pre-existing row and any session created before this column
// existed; finalizePaidCommerceSession.js already treats NULL as "no pin, re-resolve" (exactly
// today's pre-237 behavior), so a rollback and a not-yet-migrated tenant behave identically.

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => (typeof table === 'object' ? table.tableName : table)).includes(tableName);
};

const hasColumn = async (queryInterface, tableName, columnName) => {
  if (!await tableExists(queryInterface, tableName)) return false;
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'commerce_payment_sessions')) return;
    if (!await hasColumn(queryInterface, 'commerce_payment_sessions', 'delivery_fee_breakdown')) {
      await queryInterface.addColumn('commerce_payment_sessions', 'delivery_fee_breakdown', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'commerce_payment_sessions')) return;
    if (await hasColumn(queryInterface, 'commerce_payment_sessions', 'delivery_fee_breakdown')) {
      await queryInterface.removeColumn('commerce_payment_sessions', 'delivery_fee_breakdown');
    }
  }
};
