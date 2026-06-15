'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => (typeof table === 'object' ? table.tableName : table)).includes(tableName);
};

const hasColumn = async (queryInterface, tableName, columnName) => {
  if (!await tableExists(queryInterface, tableName)) return false;
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'tenant_payment_accounts')) {
      await queryInterface.createTable('tenant_payment_accounts', {
        account_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        tenant_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tenants', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        provider: { type: Sequelize.ENUM('paymongo'), allowNull: false, defaultValue: 'paymongo' },
        provider_merchant_id: { type: Sequelize.STRING(120), allowNull: false },
        provider_wallet_id: { type: Sequelize.STRING(120), allowNull: true },
        wallet_status: { type: Sequelize.ENUM('unknown', 'closed_loop', 'enabled', 'restricted'), allowNull: false, defaultValue: 'unknown' },
        wallet_verified_at: { type: Sequelize.DATE, allowNull: true },
        onboarding_status: { type: Sequelize.ENUM('not_started', 'pending', 'active', 'restricted'), allowNull: false, defaultValue: 'pending' },
        qrph_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        split_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        charges_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        requirements_due: { type: Sequelize.JSON, allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        last_synced_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }

    if (!await tableExists(queryInterface, 'commerce_payment_sessions')) {
      await queryInterface.createTable('commerce_payment_sessions', {
        session_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        public_reference: { type: Sequelize.STRING(40), allowNull: false, unique: true },
        tenant_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tenants', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        store_slug: { type: Sequelize.STRING(120), allowNull: false },
        provider: { type: Sequelize.ENUM('paymongo'), allowNull: false, defaultValue: 'paymongo' },
        target_type: { type: Sequelize.ENUM('store_checkout', 'service_booking'), allowNull: false, defaultValue: 'store_checkout' },
        status: {
          type: Sequelize.ENUM(
            'created',
            'awaiting_payment',
            'paid',
            'expired',
            'failed',
            'cancelled',
            'finalized',
            'refund_pending',
            'partial_refunded',
            'refunded',
            'paid_manual_resolution_required',
            'split_failed_manual_settlement_required'
          ),
          allowNull: false,
          defaultValue: 'created'
        },
        idempotency_key: { type: Sequelize.STRING(120), allowNull: false },
        request_hash: { type: Sequelize.STRING(64), allowNull: false },
        checkout_payload: { type: Sequelize.JSON, allowNull: false },
        subtotal_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        delivery_fee: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        service_fee_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        total_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'PHP' },
        total_amount_centavos: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        platform_fee_centavos: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        fee_policy: { type: Sequelize.JSON, allowNull: true },
        tenant_transfer_merchant_id: { type: Sequelize.STRING(120), allowNull: true },
        provider_payment_intent_id: { type: Sequelize.STRING(120), allowNull: true },
        provider_payment_method_id: { type: Sequelize.STRING(120), allowNull: true },
        provider_payment_id: { type: Sequelize.STRING(120), allowNull: true },
        provider_event_id: { type: Sequelize.STRING(160), allowNull: true },
        qr_code_image_url: { type: Sequelize.TEXT, allowNull: true },
        checkout_url: { type: Sequelize.STRING(1000), allowNull: true },
        expires_at: { type: Sequelize.DATE, allowNull: true },
        paid_at: { type: Sequelize.DATE, allowNull: true },
        finalized_at: { type: Sequelize.DATE, allowNull: true },
        pos_transaction_id: { type: Sequelize.INTEGER, allowNull: true },
        tracking_pin: { type: Sequelize.STRING(20), allowNull: true },
        split_payload: { type: Sequelize.JSON, allowNull: true },
        provider_payload: { type: Sequelize.JSON, allowNull: true },
        failure_code: { type: Sequelize.STRING(80), allowNull: true },
        failure_reason: { type: Sequelize.STRING(500), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'tenant_payment_accounts', ['tenant_id', 'provider'], {
      name: 'uq_tenant_payment_accounts_tenant_provider',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'tenant_payment_accounts', ['provider_merchant_id'], {
      name: 'idx_tenant_payment_accounts_provider_merchant'
    });
    await addIndexIfMissing(queryInterface, 'commerce_payment_sessions', ['tenant_id', 'target_type', 'idempotency_key'], {
      name: 'uq_commerce_payment_sessions_idempotency',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'commerce_payment_sessions', ['provider_payment_intent_id'], {
      name: 'idx_commerce_payment_sessions_intent'
    });
    await addIndexIfMissing(queryInterface, 'commerce_payment_sessions', ['provider_payment_id'], {
      name: 'idx_commerce_payment_sessions_payment'
    });

    if (!await tableExists(queryInterface, 'commerce_payment_refunds')) {
      await queryInterface.createTable('commerce_payment_refunds', {
        refund_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        public_reference: { type: Sequelize.STRING(40), allowNull: false, unique: true },
        payment_session_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'commerce_payment_sessions', key: 'session_id' },
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
        provider: { type: Sequelize.ENUM('paymongo'), allowNull: false, defaultValue: 'paymongo' },
        provider_refund_id: { type: Sequelize.STRING(120), allowNull: true },
        provider_payment_id: { type: Sequelize.STRING(120), allowNull: false },
        amount_centavos: { type: Sequelize.INTEGER, allowNull: false },
        currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'PHP' },
        reason: { type: Sequelize.ENUM('requested_by_customer', 'duplicate', 'fraudulent', 'others'), allowNull: false, defaultValue: 'requested_by_customer' },
        notes: { type: Sequelize.STRING(255), allowNull: true },
        refund_strategy: { type: Sequelize.ENUM('proportional', 'tenant', 'dgfy', 'custom'), allowNull: false, defaultValue: 'proportional' },
        split_refund_payload: { type: Sequelize.JSON, allowNull: true },
        status: { type: Sequelize.ENUM('created', 'pending', 'succeeded', 'failed', 'manual_review_required'), allowNull: false, defaultValue: 'created' },
        provider_payload: { type: Sequelize.JSON, allowNull: true },
        failure_code: { type: Sequelize.STRING(80), allowNull: true },
        failure_reason: { type: Sequelize.STRING(500), allowNull: true },
        requested_by: { type: Sequelize.STRING(120), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'commerce_payment_refunds', ['payment_session_id'], {
      name: 'idx_commerce_payment_refunds_session'
    });
    await addIndexIfMissing(queryInterface, 'commerce_payment_refunds', ['tenant_id'], {
      name: 'idx_commerce_payment_refunds_tenant'
    });
    await addIndexIfMissing(queryInterface, 'commerce_payment_refunds', ['provider_refund_id'], {
      name: 'idx_commerce_payment_refunds_provider'
    });
    await addIndexIfMissing(queryInterface, 'commerce_payment_refunds', ['status'], {
      name: 'idx_commerce_payment_refunds_status'
    });

    if (await tableExists(queryInterface, 'pos_transactions')) {
      if (!await hasColumn(queryInterface, 'pos_transactions', 'payment_status')) {
        await queryInterface.addColumn('pos_transactions', 'payment_status', {
          type: Sequelize.ENUM('unpaid', 'payment_pending', 'paid', 'failed', 'refund_pending', 'partial_refunded', 'refunded'),
          allowNull: false,
          defaultValue: 'paid'
        });
      }
      if (!await hasColumn(queryInterface, 'pos_transactions', 'payment_reference')) {
        await queryInterface.addColumn('pos_transactions', 'payment_reference', {
          type: Sequelize.STRING(120),
          allowNull: true
        });
      }
      if (!await hasColumn(queryInterface, 'pos_transactions', 'payment_checkout_url')) {
        await queryInterface.addColumn('pos_transactions', 'payment_checkout_url', {
          type: Sequelize.STRING(1000),
          allowNull: true
        });
      }
      if (!await hasColumn(queryInterface, 'pos_transactions', 'payment_provider')) {
        await queryInterface.addColumn('pos_transactions', 'payment_provider', {
          type: Sequelize.STRING(40),
          allowNull: true
        });
      }
      if (!await hasColumn(queryInterface, 'pos_transactions', 'payment_session_reference')) {
        await queryInterface.addColumn('pos_transactions', 'payment_session_reference', {
          type: Sequelize.STRING(40),
          allowNull: true
        });
      }
      await queryInterface.changeColumn('pos_transactions', 'payment_type', {
        type: Sequelize.ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph'),
        allowNull: false,
        defaultValue: 'cash'
      });
      await addIndexIfMissing(queryInterface, 'pos_transactions', ['payment_status'], {
        name: 'idx_pos_transactions_payment_status'
      });
      await addIndexIfMissing(queryInterface, 'pos_transactions', ['payment_session_reference'], {
        name: 'idx_pos_transactions_payment_session'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, 'pos_transactions')) {
      if (await hasColumn(queryInterface, 'pos_transactions', 'payment_session_reference')) await queryInterface.removeColumn('pos_transactions', 'payment_session_reference');
      if (await hasColumn(queryInterface, 'pos_transactions', 'payment_provider')) await queryInterface.removeColumn('pos_transactions', 'payment_provider');
      if (await hasColumn(queryInterface, 'pos_transactions', 'payment_checkout_url')) await queryInterface.removeColumn('pos_transactions', 'payment_checkout_url');
      if (await hasColumn(queryInterface, 'pos_transactions', 'payment_reference')) await queryInterface.removeColumn('pos_transactions', 'payment_reference');
      if (await hasColumn(queryInterface, 'pos_transactions', 'payment_status')) await queryInterface.removeColumn('pos_transactions', 'payment_status');
      await queryInterface.changeColumn('pos_transactions', 'payment_type', {
        type: Sequelize.ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer'),
        allowNull: false,
        defaultValue: 'cash'
      }).catch(() => null);
    }

    if (await tableExists(queryInterface, 'commerce_payment_refunds')) {
      await queryInterface.dropTable('commerce_payment_refunds');
    }
    if (await tableExists(queryInterface, 'commerce_payment_sessions')) {
      await queryInterface.dropTable('commerce_payment_sessions');
    }
    if (await tableExists(queryInterface, 'tenant_payment_accounts')) {
      await queryInterface.dropTable('tenant_payment_accounts');
    }
  }
};
