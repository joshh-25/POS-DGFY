/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((table) => (typeof table === 'object' ? table.tableName || table.name : table));

    if (!tableNames.includes('dgfy_account_handoffs')) {
      await queryInterface.createTable('dgfy_account_handoffs', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        jti: {
          type: Sequelize.STRING(80),
          allowNull: false,
          unique: true
        },
        dgfy_account_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'dgfy_accounts', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
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
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });

      await queryInterface.addIndex('dgfy_account_handoffs', ['jti'], {
        unique: true,
        name: 'unique_dgfy_account_handoffs_jti'
      });
      await queryInterface.addIndex('dgfy_account_handoffs', ['dgfy_account_id'], {
        name: 'idx_dgfy_handoffs_account'
      });
      await queryInterface.addIndex('dgfy_account_handoffs', ['expires_at'], {
        name: 'idx_dgfy_handoffs_expires_at'
      });
    }

    await queryInterface.changeColumn('email_otps', 'purpose', {
      type: Sequelize.ENUM(
        'company_registration',
        'tenant_user_registration',
        'invitation_acceptance',
        'email_change',
        'dgfy_account_verification',
        'dgfy_password_reset'
      ),
      allowNull: false
    }).catch(() => {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('dgfy_account_handoffs');

    await queryInterface.changeColumn('email_otps', 'purpose', {
      type: Sequelize.ENUM(
        'company_registration',
        'tenant_user_registration',
        'invitation_acceptance',
        'email_change',
        'dgfy_account_verification'
      ),
      allowNull: false
    }).catch(() => {});
  }
};
