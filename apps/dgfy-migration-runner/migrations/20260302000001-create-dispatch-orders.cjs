module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Create dispatch_orders table
        await queryInterface.createTable('dispatch_orders', {
            do_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            do_number: {
                type: Sequelize.STRING(50),
                allowNull: false,
                unique: true
            },
            recipient_name: {
                type: Sequelize.STRING(200),
                allowNull: false
            },
            recipient_type: {
                type: Sequelize.ENUM('external', 'internal'),
                allowNull: false,
                defaultValue: 'external'
            },
            reference_jo: {
                type: Sequelize.STRING(50),
                allowNull: true
            },
            reference_po: {
                type: Sequelize.STRING(50),
                allowNull: true
            },
            dispatch_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM('draft', 'confirmed', 'partial', 'completed', 'cancelled'),
                allowNull: false,
                defaultValue: 'draft'
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            created_by: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'user_id'
                }
            },
            confirmed_by: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                }
            },
            archived_at: {
                type: Sequelize.DATE,
                allowNull: true
            },
            archived_by: {
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

        await queryInterface.addIndex('dispatch_orders', ['status'], { name: 'idx_do_status' });
        await queryInterface.addIndex('dispatch_orders', ['dispatch_date'], { name: 'idx_do_dispatch_date' });
        await queryInterface.addIndex('dispatch_orders', ['recipient_name'], { name: 'idx_do_recipient_name' });
        await queryInterface.addIndex('dispatch_orders', ['do_number'], { name: 'idx_do_number' });

        // Create dispatch_order_lines table
        await queryInterface.createTable('dispatch_order_lines', {
            line_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            do_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'dispatch_orders',
                    key: 'do_id'
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
            qty_ordered: {
                type: Sequelize.DECIMAL(24, 12),
                allowNull: false
            },
            qty_dispatched: {
                type: Sequelize.DECIMAL(24, 12),
                allowNull: false,
                defaultValue: 0
            },
            qty_voided: {
                type: Sequelize.DECIMAL(24, 12),
                allowNull: false,
                defaultValue: 0,
                comment: 'Tracks quantity voided after dispatch for audit trail'
            },
            unit_of_measure: {
                type: Sequelize.STRING(50),
                allowNull: true
            },
            cost_per_unit: {
                type: Sequelize.DECIMAL(10, 4),
                allowNull: true,
                comment: 'Snapshot of cost at dispatch time for COGS tracking'
            },
            batch_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'fifo_batches',
                    key: 'batch_id'
                },
                comment: 'Primary FIFO/FEFO batch consumed for this line'
            },
            notes: {
                type: Sequelize.TEXT,
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

        await queryInterface.addIndex('dispatch_order_lines', ['do_id'], { name: 'idx_dol_do_id' });
        await queryInterface.addIndex('dispatch_order_lines', ['item_id'], { name: 'idx_dol_item_id' });
        await queryInterface.addIndex('dispatch_order_lines', ['do_id', 'item_id'], { name: 'idx_dol_do_item' });
    },

    down: async (queryInterface) => {
        await queryInterface.dropTable('dispatch_order_lines');
        await queryInterface.dropTable('dispatch_orders');
    }
};
