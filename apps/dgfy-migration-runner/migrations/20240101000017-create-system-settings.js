export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('system_settings', {
      setting_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      setting_key: {
        type: Sequelize.STRING(100),
        unique: true,
        allowNull: false
      },
      setting_value: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      data_type: {
        type: Sequelize.ENUM('string', 'number', 'boolean', 'json'),
        defaultValue: 'string'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('system_settings', ['setting_key'], { name: 'idx_setting_key' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('system_settings');
  }
};

