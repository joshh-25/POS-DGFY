'use strict';

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  if (!table || table[columnName]) return;
  await queryInterface.addColumn(tableName, columnName, definition);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('dgfy_customer_reviews').catch(() => null);
    if (table) {
      await queryInterface.changeColumn('dgfy_customer_reviews', 'dgfy_account_id', {
        type: Sequelize.UUID,
        allowNull: true
      }).catch(() => null);
      await addColumnIfMissing(queryInterface, 'dgfy_customer_reviews', 'reviewer_name', {
        type: Sequelize.STRING(255),
        allowNull: true
      });
      await addColumnIfMissing(queryInterface, 'dgfy_customer_reviews', 'reviewer_initials', {
        type: Sequelize.STRING(12),
        allowNull: true
      });
      await addColumnIfMissing(queryInterface, 'dgfy_customer_reviews', 'verified_purchase', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
      await addColumnIfMissing(queryInterface, 'dgfy_customer_reviews', 'submission_channel', {
        type: Sequelize.ENUM('account', 'tracking', 'order_success', 'qr', 'receipt'),
        allowNull: false,
        defaultValue: 'account'
      });
      await addColumnIfMissing(queryInterface, 'dgfy_customer_reviews', 'media_json', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }

    const inviteTable = await queryInterface.describeTable('dgfy_review_invites').catch(() => null);
    if (!inviteTable) {
      await queryInterface.createTable('dgfy_review_invites', {
        invite_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        tenant_id: {
          type: Sequelize.UUID,
          allowNull: false
        },
        activity_id: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        tracking_pin: {
          type: Sequelize.STRING(24),
          allowNull: false
        },
        target_type: {
          type: Sequelize.ENUM('product', 'service', 'hospitality_booking', 'fnb_order', 'fnb_item'),
          allowNull: false,
          defaultValue: 'fnb_item'
        },
        target_id: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        item_name: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        delivery_channel: {
          type: Sequelize.ENUM('tracking', 'order_success', 'qr', 'receipt'),
          allowNull: false,
          defaultValue: 'tracking'
        },
        token_hash: {
          type: Sequelize.STRING(128),
          allowNull: false
        },
        status: {
          type: Sequelize.ENUM('issued', 'opened', 'submitted', 'expired', 'revoked'),
          allowNull: false,
          defaultValue: 'issued'
        },
        opened_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        submitted_review_id: {
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
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    await addIndexIfMissing(queryInterface, 'dgfy_review_invites', ['tenant_id', 'tracking_pin'], {
      name: 'idx_dgfy_review_invites_tracking'
    });
    await addIndexIfMissing(queryInterface, 'dgfy_review_invites', ['tenant_id', 'target_type', 'target_id', 'status'], {
      name: 'idx_dgfy_review_invites_target'
    });
    await addIndexIfMissing(queryInterface, 'dgfy_review_invites', ['token_hash'], {
      name: 'uq_dgfy_review_invites_token_hash',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'dgfy_review_invites', ['activity_id', 'target_type', 'target_id'], {
      name: 'idx_dgfy_review_invites_activity_target'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('dgfy_review_invites', 'idx_dgfy_review_invites_activity_target').catch(() => null);
    await queryInterface.removeIndex('dgfy_review_invites', 'uq_dgfy_review_invites_token_hash').catch(() => null);
    await queryInterface.removeIndex('dgfy_review_invites', 'idx_dgfy_review_invites_target').catch(() => null);
    await queryInterface.removeIndex('dgfy_review_invites', 'idx_dgfy_review_invites_tracking').catch(() => null);
    await queryInterface.dropTable('dgfy_review_invites').catch(() => null);

    await queryInterface.removeColumn('dgfy_customer_reviews', 'media_json').catch(() => null);
    await queryInterface.removeColumn('dgfy_customer_reviews', 'submission_channel').catch(() => null);
    await queryInterface.removeColumn('dgfy_customer_reviews', 'verified_purchase').catch(() => null);
    await queryInterface.removeColumn('dgfy_customer_reviews', 'reviewer_initials').catch(() => null);
    await queryInterface.removeColumn('dgfy_customer_reviews', 'reviewer_name').catch(() => null);
    await queryInterface.changeColumn('dgfy_customer_reviews', 'dgfy_account_id', {
      type: Sequelize.UUID,
      allowNull: false
    }).catch(() => null);
  }
};
