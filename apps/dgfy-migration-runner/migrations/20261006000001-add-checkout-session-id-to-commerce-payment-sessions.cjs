'use strict';

// Landlord-only additive column. commerce_payment_sessions is not a tenant table and is not part
// of tenant schema fan-out/checksum registration.
const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => (typeof table === 'object' ? table.tableName : table)).includes(tableName);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'commerce_payment_sessions')) return;

    const columns = await queryInterface.describeTable('commerce_payment_sessions');
    if (!columns.provider_checkout_session_id) {
      await queryInterface.addColumn('commerce_payment_sessions', 'provider_checkout_session_id', {
        type: Sequelize.STRING(120),
        allowNull: true,
        comment: 'PayMongo Hosted Checkout session ID used to expire the provider checkout session.'
      });
    }

    const indexName = 'idx_commerce_payment_sessions_provider_checkout_session';
    const indexes = await queryInterface.showIndex('commerce_payment_sessions');
    if (!(indexes || []).some((index) => index.name === indexName)) {
      await queryInterface.addIndex('commerce_payment_sessions', ['provider_checkout_session_id'], {
        name: indexName
      });
    }

    // QR Ph rows store a Payment Intent resource in provider_payload; only cs_ IDs belong in this
    // new column. LEFT(..., 3) avoids treating SQL LIKE's underscore wildcard as a literal `_`.
    await queryInterface.sequelize.query(`
      UPDATE commerce_payment_sessions
      SET provider_checkout_session_id = JSON_UNQUOTE(JSON_EXTRACT(provider_payload, '$.id'))
      WHERE provider_checkout_session_id IS NULL
        AND provider_payload IS NOT NULL
        AND LEFT(JSON_UNQUOTE(JSON_EXTRACT(provider_payload, '$.id')), 3) = 'cs_'
    `);
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'commerce_payment_sessions')) return;

    const indexName = 'idx_commerce_payment_sessions_provider_checkout_session';
    const indexes = await queryInterface.showIndex('commerce_payment_sessions');
    if ((indexes || []).some((index) => index.name === indexName)) {
      await queryInterface.removeIndex('commerce_payment_sessions', indexName);
    }

    const columns = await queryInterface.describeTable('commerce_payment_sessions');
    if (columns.provider_checkout_session_id) {
      await queryInterface.removeColumn('commerce_payment_sessions', 'provider_checkout_session_id');
    }
  }
};
