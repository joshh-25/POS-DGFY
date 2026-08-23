'use strict';

// Phase 137 (#819) -- ADR 0069 clause 4b (carried over verbatim from ADR 0068 clause 4b, unchanged
// by the supersession): per-order downpayment/balance/refund/forfeiture ledger, structurally
// modeled on pos_payment_allocations (20260812000006-create-pos-split-payment-sessions.cjs), not
// platform_invoice_payments. Amounts stay peso DECIMAL(14,4) -- see the model file's own comment
// for why centavos were deliberately not used despite clause 4b permitting them.

const TABLE = 'pos_order_payments';

const normalizeTableName = (table) => typeof table === 'string'
    ? table
    : (table?.tableName || table?.TABLE_NAME || '');

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.some((table) => normalizeTableName(table).toLowerCase() === tableName.toLowerCase());
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (await tableExists(queryInterface, TABLE)) return;

        await queryInterface.createTable(TABLE, {
            pos_order_payment_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
            pos_transaction_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'pos_transactions', key: 'pos_transaction_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'RESTRICT'
            },
            kind: {
                type: Sequelize.ENUM('downpayment', 'balance', 'refund', 'forfeiture'),
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM('pending', 'successful', 'failed', 'cancelled', 'reversed'),
                allowNull: false,
                defaultValue: 'pending'
            },
            amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
            payment_method: {
                type: Sequelize.ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph', 'employee_credit', 'grab_pay', 'shopeepay'),
                allowNull: false
            },
            idempotency_key: { type: Sequelize.STRING(120), allowNull: false },
            payment_reference: { type: Sequelize.STRING(120), allowNull: true },
            payment_provider: { type: Sequelize.STRING(40), allowNull: true },
            provider_event_id: { type: Sequelize.STRING(120), allowNull: true },
            related_pos_order_payment_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: TABLE, key: 'pos_order_payment_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            recorded_by: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'users', key: 'user_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            confirmed_at: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
        });

        await queryInterface.addIndex(TABLE, ['pos_transaction_id', 'idempotency_key'], {
            name: 'uq_pos_order_payments_transaction_idempotency',
            unique: true
        });
        await queryInterface.addIndex(TABLE, ['provider_event_id'], {
            name: 'uq_pos_order_payments_provider_event_id',
            unique: true
        });
        await queryInterface.addIndex(TABLE, ['pos_transaction_id', 'status'], {
            name: 'idx_pos_order_payments_transaction_status'
        });
        await queryInterface.addIndex(TABLE, ['pos_transaction_id', 'kind'], {
            name: 'idx_pos_order_payments_transaction_kind'
        });
        await queryInterface.addIndex(TABLE, ['created_at'], {
            name: 'idx_pos_order_payments_created_at'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, TABLE)) await queryInterface.dropTable(TABLE);
    }
};
