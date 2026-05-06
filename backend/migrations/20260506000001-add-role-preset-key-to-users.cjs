'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('users');
    if (!tableInfo.role_preset_key) {
      await queryInterface.addColumn('users', 'role_preset_key', {
        type: Sequelize.STRING(80),
        allowNull: true
      });
    }

    const indexes = await queryInterface.showIndex('users').catch(() => []);
    if (!indexes.some((index) => index.name === 'idx_users_role_preset_key')) {
      await queryInterface.addIndex('users', ['role_preset_key'], {
        name: 'idx_users_role_preset_key'
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('users').catch(() => []);
    if (indexes.some((index) => index.name === 'idx_users_role_preset_key')) {
      await queryInterface.removeIndex('users', 'idx_users_role_preset_key');
    }

    const tableInfo = await queryInterface.describeTable('users');
    if (tableInfo.role_preset_key) {
      await queryInterface.removeColumn('users', 'role_preset_key');
    }
  }
};
