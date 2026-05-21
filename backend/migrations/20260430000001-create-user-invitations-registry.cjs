/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((table) => (typeof table === 'object' ? table.tableName || table.name : table));
    if (tableNames.includes('user_invitations')) return;

    await queryInterface.createTable('user_invitations', {
      invitation_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      tenant_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      role: {
        type: Sequelize.STRING(40),
        allowNull: false
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'accepted', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      },
      delivery_status: {
        type: Sequelize.ENUM('not_configured', 'sent', 'failed', 'manual_link'),
        allowNull: false,
        defaultValue: 'manual_link'
      },
      delivery_error: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      invited_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      invited_by_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      last_sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      accepted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      cancelled_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      cancelled_by_user_id: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex('user_invitations', ['tenant_id', 'email'], { name: 'idx_user_invitations_tenant_email' });
    await queryInterface.addIndex('user_invitations', ['tenant_id', 'tenant_user_id'], { name: 'idx_user_invitations_tenant_user' });
    await queryInterface.addIndex('user_invitations', ['status', 'expires_at'], { name: 'idx_user_invitations_status_expiry' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_invitations');
    if (queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_user_invitations_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_user_invitations_delivery_status').catch(() => {});
    }
  }
};
