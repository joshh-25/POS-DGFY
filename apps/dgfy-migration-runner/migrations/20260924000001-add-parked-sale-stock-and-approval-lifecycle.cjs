'use strict';

const PARKED_TABLE = 'pos_parked_sales';
const APPROVAL_TABLE = 'business_admin_approval_requests';

const describeTable = async (queryInterface, tableName) => (
  queryInterface.describeTable(tableName).catch(() => null)
);

module.exports = {
  async up(queryInterface, Sequelize) {
    const parked = await describeTable(queryInterface, PARKED_TABLE);
    if (parked) {
      if (!parked.inventory_effects) {
        await queryInterface.addColumn(PARKED_TABLE, 'inventory_effects', {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Server-resolved stock effects deducted when this parked-sale revision was saved'
        });
      }
      if (!parked.inventory_deducted_at) {
        await queryInterface.addColumn(PARKED_TABLE, 'inventory_deducted_at', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Evidence that Inventory deducted stock for this parked sale before payment'
        });
      }
      await queryInterface.sequelize.query(
        "ALTER TABLE `pos_parked_sales` MODIFY COLUMN `status` ENUM('parked','claimed','completed','cancel_pending','cancelled') NOT NULL DEFAULT 'parked'"
      );
    }

    let approvals = await describeTable(queryInterface, APPROVAL_TABLE);
    if (!approvals) {
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`business_admin_approval_requests\` (
          \`business_admin_approval_request_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`action_type\` ENUM('pos_refund','force_close_shift','pos_void','pos_parked_sale_cancel') NOT NULL,
          \`entity_type\` VARCHAR(60) NOT NULL,
          \`entity_id\` INT UNSIGNED NOT NULL,
          \`payload\` JSON NOT NULL,
          \`payload_hash\` CHAR(64) NOT NULL,
          \`status\` ENUM('pending','approved','rejected','executed','expired','cancelled') NOT NULL DEFAULT 'pending',
          \`reason\` VARCHAR(500) NOT NULL,
          \`idempotency_key\` VARCHAR(120) NOT NULL,
          \`requested_by\` INT UNSIGNED NOT NULL,
          \`approved_by\` INT UNSIGNED NULL,
          \`rejected_by\` INT UNSIGNED NULL,
          \`approval_note\` VARCHAR(500) NULL,
          \`expires_at\` DATETIME NULL,
          \`approved_at\` DATETIME NULL,
          \`rejected_at\` DATETIME NULL,
          \`executed_at\` DATETIME NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`business_admin_approval_request_id\`),
          UNIQUE KEY \`uq_business_admin_approval_action_idempotency\` (\`action_type\`, \`idempotency_key\`),
          KEY \`idx_business_admin_approval_status_created\` (\`status\`, \`created_at\`),
          KEY \`idx_business_admin_approval_entity_created\` (\`entity_type\`, \`entity_id\`, \`created_at\`),
          KEY \`idx_business_admin_approval_requested_created\` (\`requested_by\`, \`created_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      approvals = await describeTable(queryInterface, APPROVAL_TABLE);
    }
    if (approvals?.action_type) {
      await queryInterface.sequelize.query(
        "ALTER TABLE `business_admin_approval_requests` MODIFY COLUMN `action_type` ENUM('pos_refund','force_close_shift','pos_void','pos_parked_sale_cancel') NOT NULL"
      );
    }
  },

  // Forward-only: existing stock movements are audit evidence. Automatically
  // reversing or clearing them during a schema rollback could double-count stock.
  async down() {}
};
