'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => (typeof table === 'object' ? table.tableName : table)).includes(tableName);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (!indexes.some((index) => index.name === options.name)) {
    await queryInterface.addIndex(tableName, fields, options);
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'tenant_revenue_fee_policies')) {
      await queryInterface.createTable('tenant_revenue_fee_policies', {
        policy_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        tenant_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tenants', key: 'id' } },
        version: { type: Sequelize.INTEGER, allowNull: false },
        dgfy_rate_bps: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        settlement_cycle_days: { type: Sequelize.ENUM('15', '30'), allowNull: false, defaultValue: '15' },
        settlement_status: { type: Sequelize.ENUM('active', 'suspended', 'on_hold'), allowNull: false, defaultValue: 'on_hold' },
        minimum_payout_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'PHP' },
        provider_fee_payer: { type: Sequelize.ENUM('tenant', 'dgfy', 'shared'), allowNull: false, defaultValue: 'tenant' },
        shared_fee_tenant_bps: { type: Sequelize.INTEGER, allowNull: true },
        fallback_fee_policy: { type: Sequelize.JSON, allowNull: true },
        payout_destination_encrypted: { type: Sequelize.TEXT, allowNull: true },
        payout_destination_masked: { type: Sequelize.STRING(160), allowNull: true },
        automatic_payout_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        large_payout_threshold_centavos: { type: Sequelize.BIGINT, allowNull: true },
        effective_at: { type: Sequelize.DATE, allowNull: false },
        ends_at: { type: Sequelize.DATE, allowNull: true },
        reason: { type: Sequelize.STRING(500), allowNull: false },
        created_by: { type: Sequelize.STRING(120), allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'tenant_revenue_fee_policies', ['tenant_id', 'version'], {
      name: 'uq_tenant_revenue_fee_policy_version',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'tenant_revenue_fee_policies', ['tenant_id', 'effective_at'], {
      name: 'idx_tenant_revenue_fee_policy_effective'
    });

    if (!await tableExists(queryInterface, 'tenant_revenue_transactions')) {
      await queryInterface.createTable('tenant_revenue_transactions', {
        revenue_transaction_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        tenant_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tenants', key: 'id' } },
        payment_session_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'commerce_payment_sessions', key: 'session_id' } },
        policy_id: { type: Sequelize.BIGINT, allowNull: true, references: { model: 'tenant_revenue_fee_policies', key: 'policy_id' } },
        company_id: { type: Sequelize.STRING(120), allowNull: true },
        branch_id: { type: Sequelize.STRING(120), allowNull: true },
        order_id: { type: Sequelize.STRING(120), allowNull: true },
        provider: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'paymongo' },
        provider_payment_id: { type: Sequelize.STRING(120), allowNull: false },
        provider_payment_intent_id: { type: Sequelize.STRING(120), allowNull: true },
        provider_source_id: { type: Sequelize.STRING(120), allowNull: true },
        provider_balance_transaction_id: { type: Sequelize.STRING(120), allowNull: true },
        payment_method: { type: Sequelize.STRING(60), allowNull: true },
        currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'PHP' },
        gross_amount_centavos: { type: Sequelize.BIGINT, allowNull: false },
        provider_fee_centavos: { type: Sequelize.BIGINT, allowNull: true },
        provider_fee_vat_centavos: { type: Sequelize.BIGINT, allowNull: true },
        provider_net_centavos: { type: Sequelize.BIGINT, allowNull: true },
        provider_fee_source: { type: Sequelize.ENUM('webhook', 'api', 'statement', 'fallback', 'manual_review'), allowNull: false, defaultValue: 'manual_review' },
        dgfy_rate_bps: { type: Sequelize.INTEGER, allowNull: false },
        dgfy_fee_centavos: { type: Sequelize.BIGINT, allowNull: false },
        tenant_provider_fee_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        dgfy_provider_fee_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        refund_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        chargeback_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        adjustment_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        tenant_net_payable_centavos: { type: Sequelize.BIGINT, allowNull: false },
        settlement_cycle_days: { type: Sequelize.INTEGER, allowNull: false },
        eligibility_at: { type: Sequelize.DATE, allowNull: false },
        payment_status: { type: Sequelize.ENUM('paid', 'partially_refunded', 'refunded', 'chargeback', 'reversed'), allowNull: false, defaultValue: 'paid' },
        reconciliation_status: { type: Sequelize.ENUM('pending', 'reconciled', 'exception', 'approved_override'), allowNull: false, defaultValue: 'pending' },
        settlement_status: { type: Sequelize.ENUM('pending', 'eligible', 'scheduled', 'processing', 'partially_settled', 'settled', 'on_hold', 'reversed'), allowNull: false, defaultValue: 'pending' },
        provider_event_id: { type: Sequelize.STRING(160), allowNull: true },
        paid_at: { type: Sequelize.DATE, allowNull: false },
        financial_snapshot: { type: Sequelize.JSON, allowNull: false },
        created_by: { type: Sequelize.STRING(120), allowNull: false },
        approved_by: { type: Sequelize.STRING(120), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'tenant_revenue_transactions', ['payment_session_id'], {
      name: 'uq_tenant_revenue_transaction_session',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'tenant_revenue_transactions', ['provider_payment_id'], {
      name: 'uq_tenant_revenue_transaction_provider_payment',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'tenant_revenue_transactions', ['tenant_id', 'settlement_status', 'eligibility_at'], {
      name: 'idx_tenant_revenue_transaction_settlement'
    });

    if (!await tableExists(queryInterface, 'tenant_revenue_ledger_entries')) {
      await queryInterface.createTable('tenant_revenue_ledger_entries', {
        ledger_entry_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        tenant_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tenants', key: 'id' } },
        revenue_transaction_id: { type: Sequelize.BIGINT, allowNull: true, references: { model: 'tenant_revenue_transactions', key: 'revenue_transaction_id' } },
        settlement_batch_id: { type: Sequelize.BIGINT, allowNull: true },
        payout_id: { type: Sequelize.BIGINT, allowNull: true },
        entry_type: { type: Sequelize.ENUM('payment', 'provider_fee', 'platform_fee', 'refund', 'chargeback', 'adjustment', 'settlement', 'payout', 'reversal'), allowNull: false },
        debit_account: { type: Sequelize.STRING(80), allowNull: false },
        credit_account: { type: Sequelize.STRING(80), allowNull: false },
        amount_centavos: { type: Sequelize.BIGINT, allowNull: false },
        currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'PHP' },
        idempotency_key: { type: Sequelize.STRING(180), allowNull: false },
        reverses_ledger_entry_id: { type: Sequelize.BIGINT, allowNull: true },
        reason: { type: Sequelize.STRING(500), allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        created_by: { type: Sequelize.STRING(120), allowNull: false },
        approved_by: { type: Sequelize.STRING(120), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'tenant_revenue_ledger_entries', ['idempotency_key'], {
      name: 'uq_tenant_revenue_ledger_idempotency',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'tenant_revenue_ledger_entries', ['tenant_id', 'created_at'], {
      name: 'idx_tenant_revenue_ledger_tenant_date'
    });

    if (!await tableExists(queryInterface, 'tenant_settlement_batches')) {
      await queryInterface.createTable('tenant_settlement_batches', {
        settlement_batch_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        batch_number: { type: Sequelize.STRING(50), allowNull: false, unique: true },
        tenant_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tenants', key: 'id' } },
        period_start: { type: Sequelize.DATE, allowNull: false },
        period_end: { type: Sequelize.DATE, allowNull: false },
        currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'PHP' },
        gross_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        provider_fee_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        dgfy_fee_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        refund_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        chargeback_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        adjustment_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        payout_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        scheduled_payout_at: { type: Sequelize.DATE, allowNull: true },
        actual_payout_at: { type: Sequelize.DATE, allowNull: true },
        payout_destination_masked: { type: Sequelize.STRING(160), allowNull: true },
        status: { type: Sequelize.ENUM('draft', 'prepared', 'approved', 'scheduled', 'processing', 'partially_paid', 'paid', 'failed', 'on_hold', 'cancelled', 'reversed'), allowNull: false, defaultValue: 'draft' },
        prepared_by: { type: Sequelize.STRING(120), allowNull: false },
        approved_by: { type: Sequelize.STRING(120), allowNull: true },
        approved_at: { type: Sequelize.DATE, allowNull: true },
        approval_reason: { type: Sequelize.STRING(500), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'tenant_settlement_batches', ['tenant_id', 'status'], {
      name: 'idx_tenant_settlement_batch_status'
    });

    if (!await tableExists(queryInterface, 'tenant_settlement_batch_items')) {
      await queryInterface.createTable('tenant_settlement_batch_items', {
        settlement_batch_item_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        settlement_batch_id: { type: Sequelize.BIGINT, allowNull: false, references: { model: 'tenant_settlement_batches', key: 'settlement_batch_id' } },
        revenue_transaction_id: { type: Sequelize.BIGINT, allowNull: false, references: { model: 'tenant_revenue_transactions', key: 'revenue_transaction_id' } },
        included_payable_centavos: { type: Sequelize.BIGINT, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'tenant_settlement_batch_items', ['settlement_batch_id', 'revenue_transaction_id'], {
      name: 'uq_tenant_settlement_batch_item',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'tenant_settlement_batch_items', ['revenue_transaction_id'], {
      name: 'uq_tenant_settlement_successful_membership',
      unique: true
    });

    if (!await tableExists(queryInterface, 'tenant_settlement_batch_ledger_items')) {
      await queryInterface.createTable('tenant_settlement_batch_ledger_items', {
        settlement_batch_ledger_item_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true
        },
        settlement_batch_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          references: { model: 'tenant_settlement_batches', key: 'settlement_batch_id' }
        },
        ledger_entry_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          references: { model: 'tenant_revenue_ledger_entries', key: 'ledger_entry_id' }
        },
        included_adjustment_centavos: { type: Sequelize.BIGINT, allowNull: false },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
    await addIndexIfMissing(queryInterface, 'tenant_settlement_batch_ledger_items', ['ledger_entry_id'], {
      name: 'uq_tenant_settlement_batch_ledger_entry',
      unique: true
    });
    await addIndexIfMissing(
      queryInterface,
      'tenant_settlement_batch_ledger_items',
      ['settlement_batch_id', 'ledger_entry_id'],
      {
        name: 'uq_tenant_settlement_batch_ledger_membership',
        unique: true
      }
    );

    if (!await tableExists(queryInterface, 'tenant_payouts')) {
      await queryInterface.createTable('tenant_payouts', {
        payout_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        public_reference: { type: Sequelize.STRING(50), allowNull: false, unique: true },
        settlement_batch_id: { type: Sequelize.BIGINT, allowNull: false, references: { model: 'tenant_settlement_batches', key: 'settlement_batch_id' } },
        tenant_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tenants', key: 'id' } },
        amount_centavos: { type: Sequelize.BIGINT, allowNull: false },
        currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'PHP' },
        method: { type: Sequelize.ENUM('manual_bank', 'manual_paymongo', 'provider_api'), allowNull: false },
        provider_reference: { type: Sequelize.STRING(160), allowNull: true },
        destination_masked: { type: Sequelize.STRING(160), allowNull: false },
        proof_reference: { type: Sequelize.STRING(500), allowNull: true },
        status: { type: Sequelize.ENUM('approved', 'scheduled', 'processing', 'paid', 'failed', 'partially_paid', 'reversed'), allowNull: false, defaultValue: 'approved' },
        idempotency_key: { type: Sequelize.STRING(180), allowNull: false },
        initiated_by: { type: Sequelize.STRING(120), allowNull: false },
        approved_by: { type: Sequelize.STRING(120), allowNull: false },
        confirmed_by: { type: Sequelize.STRING(120), allowNull: true },
        failure_reason: { type: Sequelize.STRING(500), allowNull: true },
        confirmed_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'tenant_payouts', ['idempotency_key'], {
      name: 'uq_tenant_payout_idempotency',
      unique: true
    });

    if (!await tableExists(queryInterface, 'tenant_revenue_adjustments')) {
      await queryInterface.createTable('tenant_revenue_adjustments', {
        adjustment_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        tenant_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tenants', key: 'id' } },
        revenue_transaction_id: { type: Sequelize.BIGINT, allowNull: true, references: { model: 'tenant_revenue_transactions', key: 'revenue_transaction_id' } },
        amount_centavos: { type: Sequelize.BIGINT, allowNull: false },
        reason: { type: Sequelize.STRING(500), allowNull: false },
        status: { type: Sequelize.ENUM('pending', 'approved', 'rejected', 'posted', 'reversed'), allowNull: false, defaultValue: 'pending' },
        idempotency_key: { type: Sequelize.STRING(180), allowNull: false },
        requested_by: { type: Sequelize.STRING(120), allowNull: false },
        approved_by: { type: Sequelize.STRING(120), allowNull: true },
        approval_reason: { type: Sequelize.STRING(500), allowNull: true },
        approved_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'tenant_revenue_adjustments', ['idempotency_key'], {
      name: 'uq_tenant_revenue_adjustment_idempotency',
      unique: true
    });

    if (!await tableExists(queryInterface, 'tenant_revenue_reconciliation_records')) {
      await queryInterface.createTable('tenant_revenue_reconciliation_records', {
        reconciliation_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        tenant_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tenants', key: 'id' } },
        revenue_transaction_id: { type: Sequelize.BIGINT, allowNull: true, references: { model: 'tenant_revenue_transactions', key: 'revenue_transaction_id' } },
        exception_type: { type: Sequelize.STRING(80), allowNull: false },
        severity: { type: Sequelize.ENUM('info', 'warning', 'blocking'), allowNull: false, defaultValue: 'blocking' },
        expected_value: { type: Sequelize.JSON, allowNull: true },
        actual_value: { type: Sequelize.JSON, allowNull: true },
        status: { type: Sequelize.ENUM('open', 'resolved', 'waived'), allowNull: false, defaultValue: 'open' },
        resolution_reason: { type: Sequelize.STRING(500), allowNull: true },
        detected_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        resolved_at: { type: Sequelize.DATE, allowNull: true },
        resolved_by: { type: Sequelize.STRING(120), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'tenant_revenue_reconciliation_records', ['tenant_id', 'status', 'severity'], {
      name: 'idx_tenant_revenue_reconciliation_open'
    });
  },

  async down() {
    throw new Error('Financial settlement migration is intentionally irreversible. Preserve posted financial history.');
  }
};
