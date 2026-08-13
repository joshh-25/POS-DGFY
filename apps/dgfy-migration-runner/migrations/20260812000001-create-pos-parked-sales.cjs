'use strict';

const STATUS_VALUES = ['parked', 'claimed', 'completed', 'cancelled'];

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
        if (await tableExists(queryInterface, 'pos_parked_sales')) return;

        await queryInterface.createTable('pos_parked_sales', {
            pos_parked_sale_id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            park_reference: {
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
                type: Sequelize.ENUM(...STATUS_VALUES),
                allowNull: false,
                defaultValue: 'parked'
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
            claimed_by: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'users', key: 'user_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            claimed_terminal_id: {
                type: Sequelize.STRING(100),
                allowNull: true
            },
            claimed_at: {
                type: Sequelize.DATE,
                allowNull: true
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

        await queryInterface.addIndex('pos_parked_sales', ['status'], {
            name: 'idx_pos_parked_sales_status'
        });
        await queryInterface.addIndex('pos_parked_sales', ['shift_id', 'status'], {
            name: 'idx_pos_parked_sales_shift_status'
        });
        await queryInterface.addIndex('pos_parked_sales', ['cashier_id', 'status'], {
            name: 'idx_pos_parked_sales_cashier_status'
        });
        await queryInterface.addIndex('pos_parked_sales', ['location_id', 'status'], {
            name: 'idx_pos_parked_sales_location_status'
        });
        await queryInterface.addIndex('pos_parked_sales', ['claimed_by', 'status'], {
            name: 'idx_pos_parked_sales_claimed_by_status'
        });
        await queryInterface.addIndex('pos_parked_sales', ['created_at'], {
            name: 'idx_pos_parked_sales_created_at'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'pos_parked_sales')) {
            await queryInterface.dropTable('pos_parked_sales');
        }
    }
};
