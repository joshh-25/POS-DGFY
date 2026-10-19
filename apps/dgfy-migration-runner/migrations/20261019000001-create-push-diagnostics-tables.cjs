'use strict';

const normalizeTableNames = (tables) => tables.map((table) => (
  typeof table === 'object' ? table.tableName || table.name : table
));

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
});

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = normalizeTableNames(await queryInterface.showAllTables());

    // One row per dispatch decision that did not (or could not) produce a per-token delivery log.
    // Holds no token, owner id, or message content; reason codes are fixed internal strings.
    if (!tables.includes('push_dispatch_events')) {
      await queryInterface.createTable('push_dispatch_events', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        purpose: { type: Sequelize.STRING(50), allowNull: false },
        outcome: { type: Sequelize.STRING(20), allowNull: false },
        reason_code: { type: Sequelize.STRING(80), allowNull: false },
        tenant_id: { type: Sequelize.UUID, allowNull: true },
        reference: { type: Sequelize.STRING(32), allowNull: true },
        eligible_token_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'push_dispatch_events', ['created_at'], { name: 'idx_push_dispatch_events_created_at' });
    await addIndexIfMissing(queryInterface, 'push_dispatch_events', ['purpose', 'outcome', 'created_at'], { name: 'idx_push_dispatch_events_purpose_outcome' });

    // Operator diagnostic devices. Kept apart from push_device_tokens so no operator concept
    // lands on the customer-facing table and its single-owner CHECK constraint is untouched.
    if (!tables.includes('push_diagnostic_devices')) {
      await queryInterface.createTable('push_diagnostic_devices', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        token: { type: Sequelize.STRING(255), allowNull: false, comment: 'Case-sensitive Expo token; ASCII only; never returned by any API' },
        platform: { type: Sequelize.ENUM('ios', 'android'), allowNull: false },
        app: { type: Sequelize.STRING(80), allowNull: false },
        brand: { type: Sequelize.STRING(80), allowNull: false },
        label: { type: Sequelize.STRING(80), allowNull: true },
        enrolled_by_admin_id: { type: Sequelize.UUID, allowNull: false },
        last_seen_at: { type: Sequelize.DATE, allowNull: false },
        revoked_at: { type: Sequelize.DATE, allowNull: true },
        revoke_reason: { type: Sequelize.STRING(80), allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await addIndexIfMissing(queryInterface, 'push_diagnostic_devices', ['revoked_at', 'created_at'], { name: 'idx_push_diagnostic_devices_state' });

    if (queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query(
        'ALTER TABLE `push_diagnostic_devices` MODIFY `token` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL'
      );
      const columns = await queryInterface.describeTable('push_diagnostic_devices');
      if (!columns.active_token) {
        await queryInterface.sequelize.query(
          'ALTER TABLE `push_diagnostic_devices` ADD COLUMN `active_token` VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN `revoked_at` IS NULL THEN `token` ELSE NULL END) STORED'
        );
      }
      await addIndexIfMissing(queryInterface, 'push_diagnostic_devices', ['active_token'], {
        name: 'uq_push_diagnostic_devices_active_token', unique: true
      });
    }

    // Single-use enrollment codes. Only a keyed hash is stored; the plaintext is shown once.
    if (!tables.includes('push_diagnostic_enrollment_codes')) {
      await queryInterface.createTable('push_diagnostic_enrollment_codes', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        code_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        created_by_admin_id: { type: Sequelize.UUID, allowNull: false },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        consumed_at: { type: Sequelize.DATE, allowNull: true },
        consumed_device_id: { type: Sequelize.UUID, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await addIndexIfMissing(queryInterface, 'push_diagnostic_enrollment_codes', ['expires_at', 'consumed_at'], { name: 'idx_push_diagnostic_enrollment_codes_expiry' });
  },

  async down(queryInterface) {
    const tables = normalizeTableNames(await queryInterface.showAllTables());
    if (tables.includes('push_diagnostic_enrollment_codes')) await queryInterface.dropTable('push_diagnostic_enrollment_codes');
    if (tables.includes('push_diagnostic_devices')) await queryInterface.dropTable('push_diagnostic_devices');
    if (tables.includes('push_dispatch_events')) await queryInterface.dropTable('push_dispatch_events');
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_push_diagnostic_devices_platform').catch(() => {});
    }
  }
};
