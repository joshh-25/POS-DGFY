'use strict';

const SESSION_STATUS_VALUES = ['open', 'partially_paid', 'ready_to_complete', 'completed', 'cancelled'];
const ALLOCATION_STATUS_VALUES = ['pending', 'successful', 'failed', 'cancelled', 'reversed'];
const PAYMENT_METHOD_VALUES = ['cash', 'gcash', 'maya', 'card', 'bank_transfer'];
const PAYMENT_HANDOFF_MODE_VALUES = ['external', 'internal'];

const normalizeTableName = (table) => {
    if (!table) return '';
    if (typeof table === 'string') return table;
    if (typeof table === 'object') return table.tableName || table.TABLE_NAME || '';
    return '';
};

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.some((table) => normalizeTableName(table).toLowerCase() === tableName.toLowerCase());
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface, 'pos_payment_sessions'))) {
            await queryInterface.createTable('pos_payment_sessions', {
                pos_payment_session_id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                session_reference: {
                    type: Sequelize.STRING(40),
                    allowNull: false,
                    unique: true
                },
                idempotency_key: {
                    type: Sequelize.STRING(120),
                    allowNull: false,
                    unique: true
                },
                request_hash: {
                    type: Sequelize.STRING(64),
                    allowNull: false
                },
                status: {
                    type: Sequelize.ENUM(...SESSION_STATUS_VALUES),
                    allowNull: false,
                    defaultValue: 'open'
                },
                cashier_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                shift_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                terminal_id: {
                    type: Sequelize.STRING(100),
                    allowNull: false
                },
                location_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'tenant_locations', key: 'location_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                parked_sale_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'pos_parked_sales', key: 'pos_parked_sale_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                snapshot: {
                    type: Sequelize.JSON,
                    allowNull: false
                },
                line_count: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 0
                },
                quantity_total: {
                    type: Sequelize.DECIMAL(24, 12),
                    allowNull: false,
                    defaultValue: 0
                },
                subtotal_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                total_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                paid_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                remaining_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                completed_transaction_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'pos_transactions', key: 'pos_transaction_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                completed_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                cancelled_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                cancelled_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                cancel_reason: {
                    type: Sequelize.STRING(255),
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

            await queryInterface.addIndex('pos_payment_sessions', ['status'], {
                name: 'idx_pos_payment_sessions_status'
            });
            await queryInterface.addIndex('pos_payment_sessions', ['shift_id', 'status'], {
                name: 'idx_pos_payment_sessions_shift_status'
            });
            await queryInterface.addIndex('pos_payment_sessions', ['cashier_id', 'status'], {
                name: 'idx_pos_payment_sessions_cashier_status'
            });
            await queryInterface.addIndex('pos_payment_sessions', ['location_id', 'status'], {
                name: 'idx_pos_payment_sessions_location_status'
            });
            await queryInterface.addIndex('pos_payment_sessions', ['parked_sale_id'], {
                name: 'idx_pos_payment_sessions_parked_sale'
            });
            await queryInterface.addIndex('pos_payment_sessions', ['completed_transaction_id'], {
                name: 'idx_pos_payment_sessions_completed_transaction'
            });
            await queryInterface.addIndex('pos_payment_sessions', ['created_at'], {
                name: 'idx_pos_payment_sessions_created_at'
            });
        }

        if (!(await tableExists(queryInterface, 'pos_payment_allocations'))) {
            await queryInterface.createTable('pos_payment_allocations', {
                pos_payment_allocation_id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                allocation_reference: {
                    type: Sequelize.STRING(40),
                    allowNull: false,
                    unique: true
                },
                session_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'pos_payment_sessions', key: 'pos_payment_session_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                idempotency_key: {
                    type: Sequelize.STRING(120),
                    allowNull: false
                },
                request_hash: {
                    type: Sequelize.STRING(64),
                    allowNull: false
                },
                status: {
                    type: Sequelize.ENUM(...ALLOCATION_STATUS_VALUES),
                    allowNull: false,
                    defaultValue: 'pending'
                },
                payment_method: {
                    type: Sequelize.ENUM(...PAYMENT_METHOD_VALUES),
                    allowNull: false
                },
                payment_handoff_mode: {
                    type: Sequelize.ENUM(...PAYMENT_HANDOFF_MODE_VALUES),
                    allowNull: true
                },
                applied_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false
                },
                cash_tendered: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: true
                },
                change_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: true
                },
                payment_reference: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                payment_provider: {
                    type: Sequelize.STRING(40),
                    allowNull: true
                },
                failure_code: {
                    type: Sequelize.STRING(80),
                    allowNull: true
                },
                failure_reason: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                cashier_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                shift_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                terminal_id: {
                    type: Sequelize.STRING(100),
                    allowNull: false
                },
                location_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'tenant_locations', key: 'location_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                confirmed_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                cancelled_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                cancelled_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                cancel_reason: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                reversed_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                reversed_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                reversal_reason: {
                    type: Sequelize.STRING(255),
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

            await queryInterface.addIndex('pos_payment_allocations', ['session_id', 'status'], {
                name: 'idx_pos_payment_allocations_session_status'
            });
            await queryInterface.addIndex('pos_payment_allocations', ['session_id', 'created_at'], {
                name: 'idx_pos_payment_allocations_session_created'
            });
            await queryInterface.addIndex('pos_payment_allocations', ['shift_id', 'status'], {
                name: 'idx_pos_payment_allocations_shift_status'
            });
            await queryInterface.addIndex('pos_payment_allocations', ['location_id', 'status'], {
                name: 'idx_pos_payment_allocations_location_status'
            });
            await queryInterface.addIndex('pos_payment_allocations', ['payment_method', 'status'], {
                name: 'idx_pos_payment_allocations_method_status'
            });
            await queryInterface.addIndex('pos_payment_allocations', ['session_id', 'idempotency_key'], {
                name: 'uq_pos_payment_allocations_session_idempotency',
                unique: true
            });
            await queryInterface.addIndex('pos_payment_allocations', ['created_at'], {
                name: 'idx_pos_payment_allocations_created_at'
            });
        }
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'pos_payment_allocations')) {
            await queryInterface.dropTable('pos_payment_allocations');
        }
        if (await tableExists(queryInterface, 'pos_payment_sessions')) {
            await queryInterface.dropTable('pos_payment_sessions');
        }
    }
};
