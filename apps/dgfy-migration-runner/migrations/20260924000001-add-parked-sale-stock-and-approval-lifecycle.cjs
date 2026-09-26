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

    const approvals = await describeTable(queryInterface, APPROVAL_TABLE);
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
