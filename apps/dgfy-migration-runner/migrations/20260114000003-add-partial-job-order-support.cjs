'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Note: quantity_produced column was added in a previous migration (20260114000001)
    // This migration only updates the status ENUM to include 'partial'

    // Modify status ENUM to include 'partial'
    await queryInterface.changeColumn('job_orders', 'status', {
      type: Sequelize.ENUM('draft', 'in_progress', 'partial', 'completed', 'cancelled'),
      defaultValue: 'draft'
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert status ENUM (remove 'partial')
    // First update any 'partial' rows to 'in_progress' to avoid data loss
    await queryInterface.sequelize.query(
      `UPDATE job_orders SET status = 'in_progress' WHERE status = 'partial'`
    );

    await queryInterface.changeColumn('job_orders', 'status', {
      type: Sequelize.ENUM('draft', 'in_progress', 'completed', 'cancelled'),
      defaultValue: 'draft'
    });
  }
};
