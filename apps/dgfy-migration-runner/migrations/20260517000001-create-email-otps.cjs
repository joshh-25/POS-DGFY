/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((table) => (typeof table === 'object' ? table.tableName || table.name : table));
    if (tableNames.includes('email_otps')) return;

    await queryInterface.createTable('email_otps', {
      otp_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      purpose: {
        type: Sequelize.ENUM('company_registration', 'tenant_user_registration', 'invitation_acceptance', 'email_change'),
        allowNull: false
      },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'tenants', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      code_hash: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      max_attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5
      },
      delivery_status: {
        type: Sequelize.ENUM('sent', 'failed'),
        allowNull: false,
        defaultValue: 'sent'
      },
      delivery_error: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      consumed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('email_otps', ['purpose', 'email', 'tenant_id', 'consumed_at'], {
      name: 'idx_email_otps_lookup'
    });
    await queryInterface.addIndex('email_otps', ['expires_at'], {
      name: 'idx_email_otps_expires_at'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_otps');
    if (queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_email_otps_purpose').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_email_otps_delivery_status').catch(() => {});
    }
  }
};
