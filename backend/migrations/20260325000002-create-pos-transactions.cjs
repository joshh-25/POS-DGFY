module.exports = {
    up: async (queryInterface, Sequelize) => {
        const existingTables = await queryInterface.showAllTables();
        const tableSet = new Set(
            (existingTables || []).map((entry) => (
                typeof entry === 'string'
                    ? entry.toLowerCase()
                    : String(entry.tableName || entry).toLowerCase()
            ))
        );

        if (!tableSet.has('pos_transactions')) {
            await queryInterface.createTable('pos_transactions', {
                pos_transaction_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                invoice_number: {
                    type: Sequelize.STRING(50),
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
                cashier_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'users',
                        key: 'user_id'
                    }
                },
                terminal_id: {
                    type: Sequelize.STRING(100),
                    allowNull: true
                },
                order_method: {
                    type: Sequelize.ENUM('dine_in', 'takeout', 'delivery', 'online'),
                    allowNull: false,
                    defaultValue: 'dine_in'
                },
                payment_type: {
                    type: Sequelize.ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer'),
                    allowNull: false,
                    defaultValue: 'cash'
                },
                subtotal_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                vatable_sales: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                vat_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                vat_exempt_sales: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                zero_rated_sales: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                discount_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                total_amount: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false,
                    defaultValue: 0
                },
                status: {
                    type: Sequelize.ENUM('completed', 'voided'),
                    allowNull: false,
                    defaultValue: 'completed'
                },
                voided_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                voided_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'users',
                        key: 'user_id'
                    }
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

            await queryInterface.addIndex('pos_transactions', ['invoice_number'], { name: 'idx_pos_transactions_invoice' });
            await queryInterface.addIndex('pos_transactions', ['idempotency_key'], { name: 'idx_pos_transactions_idempotency' });
            await queryInterface.addIndex('pos_transactions', ['cashier_id'], { name: 'idx_pos_transactions_cashier' });
            await queryInterface.addIndex('pos_transactions', ['created_at'], { name: 'idx_pos_transactions_created_at' });
            await queryInterface.addIndex('pos_transactions', ['status'], { name: 'idx_pos_transactions_status' });
        }

        if (!tableSet.has('pos_transaction_lines')) {
            await queryInterface.createTable('pos_transaction_lines', {
                line_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                pos_transaction_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'pos_transactions',
                        key: 'pos_transaction_id'
                    },
                    onDelete: 'CASCADE'
                },
                item_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'items',
                        key: 'item_id'
                    }
                },
                quantity: {
                    type: Sequelize.DECIMAL(24, 12),
                    allowNull: false
                },
                unit_of_measure: {
                    type: Sequelize.STRING(50),
                    allowNull: true
                },
                cost_snapshot: {
                    type: Sequelize.DECIMAL(10, 4),
                    allowNull: true
                },
                sale_price: {
                    type: Sequelize.DECIMAL(10, 4),
                    allowNull: false
                },
                line_subtotal: {
                    type: Sequelize.DECIMAL(14, 4),
                    allowNull: false
                },
                vat_type_snapshot: {
                    type: Sequelize.ENUM('vatable', 'vat_exempt', 'zero_rated'),
                    allowNull: false,
                    defaultValue: 'vatable'
                },
                vat_rate_snapshot: {
                    type: Sequelize.DECIMAL(5, 4),
                    allowNull: false,
                    defaultValue: 0.1200
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

            await queryInterface.addIndex('pos_transaction_lines', ['pos_transaction_id'], { name: 'idx_pos_lines_transaction_id' });
            await queryInterface.addIndex('pos_transaction_lines', ['item_id'], { name: 'idx_pos_lines_item_id' });
        }

        if (!tableSet.has('pos_invoice_counters')) {
            await queryInterface.createTable('pos_invoice_counters', {
                counter_key: {
                    type: Sequelize.STRING(50),
                    primaryKey: true
                },
                current_value: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: false,
                    defaultValue: 0
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
        }

        const [existingCounterRows] = await queryInterface.sequelize.query(
            "SELECT counter_key FROM pos_invoice_counters WHERE counter_key = 'POS_OR' LIMIT 1"
        );
        if (!existingCounterRows || existingCounterRows.length === 0) {
            await queryInterface.bulkInsert('pos_invoice_counters', [
                {
                    counter_key: 'POS_OR',
                    current_value: 0,
                    created_at: new Date(),
                    updated_at: new Date()
                }
            ]);
        }
    },

    down: async (queryInterface) => {
        const existingTables = await queryInterface.showAllTables();
        const tableSet = new Set(
            (existingTables || []).map((entry) => (
                typeof entry === 'string'
                    ? entry.toLowerCase()
                    : String(entry.tableName || entry).toLowerCase()
            ))
        );

        if (tableSet.has('pos_transaction_lines')) {
            await queryInterface.dropTable('pos_transaction_lines');
        }
        if (tableSet.has('pos_transactions')) {
            await queryInterface.dropTable('pos_transactions');
        }
        if (tableSet.has('pos_invoice_counters')) {
            await queryInterface.dropTable('pos_invoice_counters');
        }
    }
};

