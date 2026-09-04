'use strict';

const TABLE = 'pos_transaction_adjustments';

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
            pos_transaction_adjustment_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
            adjustment_reference: { type: Sequelize.STRING(40), allowNull: false, unique: true },
            pos_transaction_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'pos_transactions', key: 'pos_transaction_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'RESTRICT'
            },
            original_cashier_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'users', key: 'user_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            original_shift_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            original_terminal_id: { type: Sequelize.STRING(100), allowNull: true },
            original_location_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'tenant_locations', key: 'location_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            actor_user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'user_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'RESTRICT'
            },
            actor_shift_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            actor_terminal_id: { type: Sequelize.STRING(100), allowNull: true },
            actor_location_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'tenant_locations', key: 'location_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            adjustment_type: {
                type: Sequelize.ENUM(
                    'void',
                    'cash_refund',
                    'external_refund',
                    'provider_refund',
                    'employee_credit_reversal'
                ),
                allowNull: false
            },
            tender_type: { type: Sequelize.STRING(40), allowNull: false },
            amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
            currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'PHP' },
            status: {
                type: Sequelize.ENUM('pending', 'succeeded', 'failed', 'cancelled', 'manual_review_required'),
                allowNull: false,
                defaultValue: 'pending'
            },
            reason: { type: Sequelize.STRING(255), allowNull: false },
            idempotency_key: { type: Sequelize.STRING(120), allowNull: false },
            request_hash: { type: Sequelize.STRING(64), allowNull: false },
            approved_by: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'users', key: 'user_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            approved_at: { type: Sequelize.DATE, allowNull: true },
            external_reference: { type: Sequelize.STRING(255), allowNull: true },
            provider: { type: Sequelize.STRING(40), allowNull: true },
            provider_reference: { type: Sequelize.STRING(120), allowNull: true },
            provider_event_id: { type: Sequelize.STRING(255), allowNull: true },
            cash_drawer_event_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'pos_cash_drawer_events', key: 'pos_cash_drawer_event_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            failure_code: { type: Sequelize.STRING(80), allowNull: true },
            failure_reason: { type: Sequelize.STRING(500), allowNull: true },
            retry_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
            last_retry_at: { type: Sequelize.DATE, allowNull: true },
            completed_at: { type: Sequelize.DATE, allowNull: true },
            failed_at: { type: Sequelize.DATE, allowNull: true },
            cancelled_at: { type: Sequelize.DATE, allowNull: true },
            metadata: { type: Sequelize.JSON, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
        });

        await queryInterface.addIndex(TABLE, ['pos_transaction_id', 'idempotency_key'], {
            name: 'uq_pos_transaction_adjustments_transaction_idempotency',
            unique: true
        });
        await queryInterface.addIndex(TABLE, ['provider_event_id'], {
            name: 'uq_pos_transaction_adjustments_provider_event_id',
            unique: true
        });
        await queryInterface.addIndex(TABLE, ['pos_transaction_id', 'created_at'], {
            name: 'idx_pos_transaction_adjustments_transaction_created'
        });
        await queryInterface.addIndex(TABLE, ['original_shift_id', 'created_at'], {
            name: 'idx_pos_transaction_adjustments_original_shift_created'
        });
        await queryInterface.addIndex(TABLE, ['actor_user_id', 'created_at'], {
            name: 'idx_pos_transaction_adjustments_actor_created'
        });
        await queryInterface.addIndex(TABLE, ['status', 'created_at'], {
            name: 'idx_pos_transaction_adjustments_status_created'
        });
        await queryInterface.addIndex(TABLE, ['cash_drawer_event_id'], {
            name: 'idx_pos_transaction_adjustments_cash_drawer_event'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, TABLE)) await queryInterface.dropTable(TABLE);
    }
};
