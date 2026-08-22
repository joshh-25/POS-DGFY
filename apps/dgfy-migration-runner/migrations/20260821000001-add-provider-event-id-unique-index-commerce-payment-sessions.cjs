'use strict';

// #476: close the event-level idempotency gap on the PayMongo commerce webhook path.
// provider_event_id is written directly onto the commerce_payment_sessions row (not a
// separate append-only events table), so this unique index does not by itself stop the
// same session processing the same event twice -- that's guarded by the row lock added in
// processVerifiedPaidCommerceSession.js. What this index stops is the same provider event id
// ever being recorded against TWO DIFFERENT session rows (a misrouted replay, or a
// findSessionForResource lookup resolving to the wrong session) -- mirrors
// uq_pos_payment_allocations_provider_event_id (20260812000007-...cjs) applied to this schema.
// MySQL/InnoDB treats each NULL as distinct in a unique index, so the many pre-webhook rows
// with provider_event_id: null are unaffected.

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => (typeof table === 'object' ? table.tableName : table)).includes(tableName);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

const removeIndexIfPresent = async (queryInterface, tableName, indexName) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (!indexes.some((index) => index.name === indexName)) return;
  await queryInterface.removeIndex(tableName, indexName);
};

module.exports = {
  async up(queryInterface) {
    if (!await tableExists(queryInterface, 'commerce_payment_sessions')) return;

    await addIndexIfMissing(queryInterface, 'commerce_payment_sessions', ['provider_event_id'], {
      name: 'uq_commerce_payment_sessions_provider_event',
      unique: true
    });
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'commerce_payment_sessions')) return;

    await removeIndexIfPresent(queryInterface, 'commerce_payment_sessions', 'uq_commerce_payment_sessions_provider_event');
  }
};
