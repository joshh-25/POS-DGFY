/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    rollbackDescription: 'Drops runner_contract_placeholder (Phase 1 contract-proof table only — carries no production data)',
    estimatedRisk: 'low'
  },

  async up(queryInterface, Sequelize) {
    const existingTables = await queryInterface.showAllTables();
    const hasTable = existingTables.some((table) => (
      String(table).toLowerCase() === 'runner_contract_placeholder'
    ));

    if (!hasTable) {
      await queryInterface.createTable('runner_contract_placeholder', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        note: {
          type: Sequelize.STRING(255),
          allowNull: false,
          defaultValue: 'Phase 1 migration runner contract proof'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('runner_contract_placeholder');
  }
};
