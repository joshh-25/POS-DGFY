'use strict';

const SHIFT_STATUS_ENUM = ['open', 'closed'];
const CASH_EVENT_TYPE_ENUM = ['cash_in', 'cash_out', 'opening_adjustment', 'closing_adjustment'];

const normalizeTableName = (table) => {
    if (!table) return '';
    if (typeof table === 'string') return table;
    if (typeof table === 'object') {
        return table.tableName || table.TABLE_NAME || '';
    }
    return '';
};

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.map(normalizeTableName).includes(tableName);
};

const columnExists = async (queryInterface, tableName, columnName) => {
    try {
        const table = await queryInterface.describeTable(tableName);
        return Boolean(table && table[columnName]);
    } catch {
        return false;
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface, 'pos_terminal_shifts'))) {
            await queryInterface.createTable('pos_terminal_shifts', {
                pos_terminal_shift_id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                business_date: {
                    type: Sequelize.DATEONLY,
                    allowNull: false
                },
                terminal_id: {
                    type: Sequelize.STRING(100),
                    allowNull: false
                },
                cashier_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'users',
                        key: 'user_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'RESTRICT'
                },
                opening_float_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                opening_note: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                opened_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                closing_cash_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: true
                },
                expected_cash_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: true
                },
                cash_variance_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: true
                },
                closing_note: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                closed_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                closed_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'users',
                        key: 'user_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL'
                },
                status: {
                    type: Sequelize.ENUM(...SHIFT_STATUS_ENUM),
                    allowNull: false,
                    defaultValue: 'open'
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

            await queryInterface.addIndex('pos_terminal_shifts', ['business_date'], {
                name: 'idx_pos_terminal_shifts_business_date'
            });
            await queryInterface.addIndex('pos_terminal_shifts', ['terminal_id'], {
                name: 'idx_pos_terminal_shifts_terminal_id'
            });
            await queryInterface.addIndex('pos_terminal_shifts', ['cashier_id', 'status'], {
                name: 'idx_pos_terminal_shifts_cashier_status'
            });
            await queryInterface.addIndex('pos_terminal_shifts', ['terminal_id', 'status'], {
                name: 'idx_pos_terminal_shifts_terminal_status'
            });
        }

        if (!(await tableExists(queryInterface, 'pos_cash_drawer_events'))) {
            await queryInterface.createTable('pos_cash_drawer_events', {
                pos_cash_drawer_event_id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                pos_terminal_shift_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'pos_terminal_shifts',
                        key: 'pos_terminal_shift_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                event_type: {
                    type: Sequelize.ENUM(...CASH_EVENT_TYPE_ENUM),
                    allowNull: false
                },
                amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false
                },
                reason: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                recorded_by: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'users',
                        key: 'user_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'RESTRICT'
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

            await queryInterface.addIndex('pos_cash_drawer_events', ['pos_terminal_shift_id'], {
                name: 'idx_pos_cash_drawer_events_shift_id'
            });
            await queryInterface.addIndex('pos_cash_drawer_events', ['event_type'], {
                name: 'idx_pos_cash_drawer_events_type'
            });
            await queryInterface.addIndex('pos_cash_drawer_events', ['recorded_by'], {
                name: 'idx_pos_cash_drawer_events_recorded_by'
            });
        }

        if (await tableExists(queryInterface, 'pos_transactions')) {
            if (!(await columnExists(queryInterface, 'pos_transactions', 'shift_id'))) {
                await queryInterface.addColumn('pos_transactions', 'shift_id', {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'pos_terminal_shifts',
                        key: 'pos_terminal_shift_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL'
                });
                await queryInterface.addIndex('pos_transactions', ['shift_id'], {
                    name: 'idx_pos_transactions_shift_id'
                });
            }
        }

        if (await tableExists(queryInterface, 'pos_transaction_lines')) {
            if (!(await columnExists(queryInterface, 'pos_transaction_lines', 'sale_price_overridden'))) {
                await queryInterface.addColumn('pos_transaction_lines', 'sale_price_overridden', {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                });
            }
            if (!(await columnExists(queryInterface, 'pos_transaction_lines', 'price_override_reason'))) {
                await queryInterface.addColumn('pos_transaction_lines', 'price_override_reason', {
                    type: Sequelize.STRING(255),
                    allowNull: true
                });
            }
        }
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'pos_transaction_lines')) {
            if (await columnExists(queryInterface, 'pos_transaction_lines', 'price_override_reason')) {
                await queryInterface.removeColumn('pos_transaction_lines', 'price_override_reason');
            }
            if (await columnExists(queryInterface, 'pos_transaction_lines', 'sale_price_overridden')) {
                await queryInterface.removeColumn('pos_transaction_lines', 'sale_price_overridden');
            }
        }

        if (await tableExists(queryInterface, 'pos_transactions')) {
            if (await columnExists(queryInterface, 'pos_transactions', 'shift_id')) {
                await queryInterface.removeIndex('pos_transactions', 'idx_pos_transactions_shift_id').catch(() => {});
                await queryInterface.removeColumn('pos_transactions', 'shift_id');
            }
        }

        if (await tableExists(queryInterface, 'pos_cash_drawer_events')) {
            await queryInterface.dropTable('pos_cash_drawer_events');
        }

        if (await tableExists(queryInterface, 'pos_terminal_shifts')) {
            await queryInterface.dropTable('pos_terminal_shifts');
        }
    }
};
