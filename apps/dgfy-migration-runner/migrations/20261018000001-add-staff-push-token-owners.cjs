'use strict';

const normalizeTableNames = (tables) => tables.map((table) => (
  typeof table === 'object' ? table.tableName || table.name : table
));

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

const checkConstraint = async (queryInterface, Sequelize) => {
  if (queryInterface.sequelize.getDialect() !== 'mysql') return null;
  const rows = await queryInterface.sequelize.query(
    'SELECT CONSTRAINT_NAME, CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = \'chk_push_device_tokens_owner\'',
    { type: Sequelize.QueryTypes.SELECT }
  ).catch(() => []);
  return rows[0] || null;
};

const replaceOwnerCheck = async (queryInterface, Sequelize, { staffOwners = true } = {}) => {
  if (queryInterface.sequelize.getDialect() !== 'mysql') return;
  const current = await checkConstraint(queryInterface, Sequelize);
  const hasStaffOwnerBranch = String(current?.CHECK_CLAUSE || '').includes('staff_tenant_id');
  if (current && hasStaffOwnerBranch === staffOwners) return;

  if (current) {
    await queryInterface.sequelize.query(
      'ALTER TABLE `push_device_tokens` DROP CONSTRAINT `chk_push_device_tokens_owner`'
    );
  }

  const ownerCheck = staffOwners
    ? 'ALTER TABLE `push_device_tokens` ADD CONSTRAINT `chk_push_device_tokens_owner` CHECK (((`dgfy_account_id` IS NOT NULL) AND (`guest_tenant_id` IS NULL) AND (`guest_order_reference` IS NULL) AND (`guest_pos_transaction_id` IS NULL) AND (`staff_tenant_id` IS NULL) AND (`staff_user_id` IS NULL)) OR ((`dgfy_account_id` IS NULL) AND (`guest_tenant_id` IS NOT NULL) AND (`guest_order_reference` IS NOT NULL) AND (`guest_pos_transaction_id` IS NOT NULL) AND (`staff_tenant_id` IS NULL) AND (`staff_user_id` IS NULL)) OR ((`dgfy_account_id` IS NULL) AND (`guest_tenant_id` IS NULL) AND (`guest_order_reference` IS NULL) AND (`guest_pos_transaction_id` IS NULL) AND (`staff_tenant_id` IS NOT NULL) AND (`staff_user_id` IS NOT NULL)))'
    : 'ALTER TABLE `push_device_tokens` ADD CONSTRAINT `chk_push_device_tokens_owner` CHECK (((`dgfy_account_id` IS NOT NULL) AND (`guest_tenant_id` IS NULL) AND (`guest_order_reference` IS NULL) AND (`guest_pos_transaction_id` IS NULL)) OR ((`dgfy_account_id` IS NULL) AND (`guest_tenant_id` IS NOT NULL) AND (`guest_order_reference` IS NOT NULL) AND (`guest_pos_transaction_id` IS NOT NULL)))';
  await queryInterface.sequelize.query(ownerCheck);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = normalizeTableNames(await queryInterface.showAllTables());
    if (!tables.includes('push_device_tokens')) return;

    let columns = await queryInterface.describeTable('push_device_tokens');
    if (!columns.staff_tenant_id) {
      await queryInterface.addColumn('push_device_tokens', 'staff_tenant_id', {
        type: Sequelize.UUID,
        allowNull: true
      });
    }
    columns = await queryInterface.describeTable('push_device_tokens');
    if (!columns.staff_user_id) {
      await queryInterface.addColumn('push_device_tokens', 'staff_user_id', {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true
      });
    }

    await addIndexIfMissing(queryInterface, 'push_device_tokens', ['staff_tenant_id', 'staff_user_id', 'revoked_at'], {
      name: 'idx_push_device_tokens_staff_active'
    });
    await replaceOwnerCheck(queryInterface, Sequelize, { staffOwners: true });
  },

  async down(queryInterface, Sequelize) {
    const tables = normalizeTableNames(await queryInterface.showAllTables());
    if (!tables.includes('push_device_tokens')) return;

    const columns = await queryInterface.describeTable('push_device_tokens');
    if (columns.staff_tenant_id && columns.staff_user_id) {
      // Staff tokens have no equivalent owner in the pre-staff schema. They are device credentials,
      // so remove those bindings before restoring the two-owner constraint.
      await queryInterface.sequelize.query(
        'DELETE FROM push_device_tokens WHERE staff_tenant_id IS NOT NULL OR staff_user_id IS NOT NULL'
      );
    }

    if (queryInterface.sequelize.getDialect() === 'mysql') {
      await replaceOwnerCheck(queryInterface, Sequelize, { staffOwners: false });
    }

    const indexes = await queryInterface.showIndex('push_device_tokens').catch(() => []);
    if (indexes.some((index) => index.name === 'idx_push_device_tokens_staff_active')) {
      await queryInterface.removeIndex('push_device_tokens', 'idx_push_device_tokens_staff_active');
    }

    if (columns.staff_user_id) await queryInterface.removeColumn('push_device_tokens', 'staff_user_id');
    if (columns.staff_tenant_id) await queryInterface.removeColumn('push_device_tokens', 'staff_tenant_id');
  }
};
