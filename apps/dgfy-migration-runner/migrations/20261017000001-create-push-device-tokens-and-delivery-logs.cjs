'use strict';

const normalizeTableNames = (tables) => tables.map((table) => (
  typeof table === 'object' ? table.tableName || table.name : table
));

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = normalizeTableNames(await queryInterface.showAllTables());

    if (!tables.includes('push_device_tokens')) {
      await queryInterface.createTable('push_device_tokens', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        token: { type: Sequelize.STRING(255), allowNull: false, comment: 'Case-sensitive Expo token; ASCII only' },
        platform: { type: Sequelize.ENUM('ios', 'android'), allowNull: false },
        app: { type: Sequelize.STRING(80), allowNull: false },
        brand: { type: Sequelize.STRING(80), allowNull: false },
        dgfy_account_id: { type: Sequelize.UUID, allowNull: true },
        guest_tenant_id: { type: Sequelize.UUID, allowNull: true },
        guest_order_reference: { type: Sequelize.STRING(32), allowNull: true },
        guest_pos_transaction_id: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        last_seen_at: { type: Sequelize.DATE, allowNull: false },
        revoked_at: { type: Sequelize.DATE, allowNull: true },
        revoke_reason: { type: Sequelize.STRING(80), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'push_device_tokens', ['dgfy_account_id', 'revoked_at'], { name: 'idx_push_device_tokens_account_active' });
    await addIndexIfMissing(queryInterface, 'push_device_tokens', ['guest_tenant_id', 'guest_order_reference', 'revoked_at'], { name: 'idx_push_device_tokens_guest_active' });
    await addIndexIfMissing(queryInterface, 'push_device_tokens', ['created_at', 'revoked_at'], { name: 'idx_push_device_tokens_retention' });

    if (queryInterface.sequelize.getDialect() === 'mysql') {
      // Expo token matching is case-sensitive. The generated active-token uniqueness key inherits
      // this binary collation so distinct token strings never collide under MySQL's usual CI collation.
      await queryInterface.sequelize.query(
        'ALTER TABLE `push_device_tokens` MODIFY `token` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL'
      );
      const columns = await queryInterface.describeTable('push_device_tokens');
      if (!columns.active_token) {
        await queryInterface.sequelize.query(
          'ALTER TABLE `push_device_tokens` ADD COLUMN `active_token` VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN `revoked_at` IS NULL THEN `token` ELSE NULL END) STORED'
        );
      }
      await addIndexIfMissing(queryInterface, 'push_device_tokens', ['active_token'], {
        name: 'uq_push_device_tokens_active_token', unique: true
      });
      const constraints = await queryInterface.sequelize.query(
        'SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'push_device_tokens\' AND CONSTRAINT_NAME = \'chk_push_device_tokens_owner\'',
        { type: Sequelize.QueryTypes.SELECT }
      ).catch(() => []);
      if (!constraints.length) {
        await queryInterface.sequelize.query(
          'ALTER TABLE `push_device_tokens` ADD CONSTRAINT `chk_push_device_tokens_owner` CHECK (((`dgfy_account_id` IS NOT NULL) AND (`guest_tenant_id` IS NULL) AND (`guest_order_reference` IS NULL) AND (`guest_pos_transaction_id` IS NULL)) OR ((`dgfy_account_id` IS NULL) AND (`guest_tenant_id` IS NOT NULL) AND (`guest_order_reference` IS NOT NULL) AND (`guest_pos_transaction_id` IS NOT NULL)))'
        );
      }
    }

    const refreshedTables = normalizeTableNames(await queryInterface.showAllTables());
    if (!refreshedTables.includes('push_delivery_logs')) {
      await queryInterface.createTable('push_delivery_logs', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        dedupe_key: { type: Sequelize.STRING(255), allowNull: false, unique: true },
        token_id: { type: Sequelize.UUID, allowNull: false },
        token_hash: { type: Sequelize.STRING(64), allowNull: false },
        purpose: { type: Sequelize.STRING(50), allowNull: false },
        status: { type: Sequelize.ENUM('pending', 'accepted', 'rejected', 'failed', 'unconfigured'), allowNull: false },
        simulated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ticket_id: { type: Sequelize.STRING(128), allowNull: true },
        receipt_status: { type: Sequelize.STRING(80), allowNull: true },
        receipt_checked_at: { type: Sequelize.DATE, allowNull: true },
        error_code: { type: Sequelize.STRING(80), allowNull: true },
        tenant_id: { type: Sequelize.UUID, allowNull: true },
        reference: { type: Sequelize.STRING(32), allowNull: true },
        sent_at: { type: Sequelize.DATE, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'push_delivery_logs', ['status', 'sent_at'], { name: 'idx_push_delivery_logs_status_sent_at' });
    await addIndexIfMissing(queryInterface, 'push_delivery_logs', ['token_id', 'sent_at'], { name: 'idx_push_delivery_logs_token_sent_at' });
    await addIndexIfMissing(queryInterface, 'push_delivery_logs', ['tenant_id', 'reference', 'sent_at'], { name: 'idx_push_delivery_logs_order_sent_at' });
    await addIndexIfMissing(queryInterface, 'push_delivery_logs', ['receipt_checked_at', 'sent_at'], { name: 'idx_push_delivery_logs_receipt_poll' });
  },

  async down(queryInterface) {
    const tables = normalizeTableNames(await queryInterface.showAllTables());
    if (tables.includes('push_delivery_logs')) await queryInterface.dropTable('push_delivery_logs');
    if (tables.includes('push_device_tokens')) await queryInterface.dropTable('push_device_tokens');
    if (queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_push_device_tokens_platform').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_push_delivery_logs_status').catch(() => {});
    }
  }
};
