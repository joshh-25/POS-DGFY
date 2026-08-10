module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('dgfy_accounts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      first_name: {
        type: Sequelize.STRING(80),
        allowNull: false
      },
      last_name: {
        type: Sequelize.STRING(80),
        allowNull: false
      },
      username: {
        type: Sequelize.STRING(80),
        allowNull: false
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      phone: {
        type: Sequelize.STRING(40),
        allowNull: false
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      last_login_at: {
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

    await queryInterface.addIndex('dgfy_accounts', ['email'], {
      unique: true,
      name: 'unique_dgfy_accounts_email'
    });
    await queryInterface.addIndex('dgfy_accounts', ['phone'], {
      unique: true,
      name: 'unique_dgfy_accounts_phone'
    });
    await queryInterface.addIndex('dgfy_accounts', ['username'], {
      name: 'idx_dgfy_accounts_username'
    });

    await queryInterface.createTable('dgfy_account_tenant_memberships', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      dgfy_account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'dgfy_accounts', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
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
        allowNull: true
      },
      role: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: 'staff'
      },
      status: {
        type: Sequelize.ENUM('pending', 'accepted', 'declined', 'removed'),
        allowNull: false,
        defaultValue: 'pending'
      },
      source: {
        type: Sequelize.ENUM('founder', 'invite'),
        allowNull: false,
        defaultValue: 'invite'
      },
      accepted_at: {
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

    await queryInterface.addIndex('dgfy_account_tenant_memberships', ['dgfy_account_id', 'tenant_id'], {
      unique: true,
      name: 'unique_dgfy_account_tenant'
    });
    await queryInterface.addIndex('dgfy_account_tenant_memberships', ['tenant_id'], {
      name: 'idx_dgfy_memberships_tenant'
    });
    await queryInterface.addIndex('dgfy_account_tenant_memberships', ['status'], {
      name: 'idx_dgfy_memberships_status'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('dgfy_account_tenant_memberships');
    await queryInterface.dropTable('dgfy_accounts');
  }
};
