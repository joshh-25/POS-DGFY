const ONLINE_FULFILLMENT_STATUSES = [
    'placed',
    'confirmed',
    'preparing',
    'ready_for_pickup',
    'out_for_delivery',
    'completed',
    'cancelled',
    'rejected'
];

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).some((entry) => {
        const value = typeof entry === 'string'
            ? entry
            : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase() === String(tableName).toLowerCase();
    });
};

const hasColumn = async (queryInterface, tableName, columnName) => {
    try {
        const description = await queryInterface.describeTable(tableName);
        return Object.prototype.hasOwnProperty.call(description, columnName);
    } catch {
        return false;
    }
};

const hasIndex = async (queryInterface, tableName, indexName) => {
    try {
        const indexes = await queryInterface.showIndex(tableName);
        return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
    } catch {
        return false;
    }
};

const addIndexIfMissing = async (queryInterface, tableName, columns, options = {}) => {
    const name = options.name;
    if (name && await hasIndex(queryInterface, tableName, name)) {
        return;
    }
    await queryInterface.addIndex(tableName, columns, options);
};

const removeIndexIfExists = async (queryInterface, tableName, indexName) => {
    if (await hasIndex(queryInterface, tableName, indexName)) {
        await queryInterface.removeIndex(tableName, indexName);
    }
};

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = 'pos_transactions';
        if (!await tableExists(queryInterface, tableName)) {
            return;
        }

        // Online storefront checkouts are created before a cashier accepts the order.
        // Keep existing FK but allow null cashier_id for online_store records.
        await queryInterface.changeColumn(tableName, 'cashier_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'user_id'
            }
        });

        if (!await hasColumn(queryInterface, tableName, 'order_source')) {
            await queryInterface.addColumn(tableName, 'order_source', {
                type: Sequelize.ENUM('in_store', 'online_store'),
                allowNull: false,
                defaultValue: 'in_store'
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'fulfillment_status')) {
            await queryInterface.addColumn(tableName, 'fulfillment_status', {
                type: Sequelize.ENUM(...ONLINE_FULFILLMENT_STATUSES),
                allowNull: true,
                defaultValue: null
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'location_id')) {
            await queryInterface.addColumn(tableName, 'location_id', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'tenant_locations',
                    key: 'location_id'
                }
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'tracking_pin')) {
            await queryInterface.addColumn(tableName, 'tracking_pin', {
                type: Sequelize.STRING(20),
                allowNull: true
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'customer_name')) {
            await queryInterface.addColumn(tableName, 'customer_name', {
                type: Sequelize.STRING(255),
                allowNull: true
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'customer_phone')) {
            await queryInterface.addColumn(tableName, 'customer_phone', {
                type: Sequelize.STRING(50),
                allowNull: true
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'customer_email')) {
            await queryInterface.addColumn(tableName, 'customer_email', {
                type: Sequelize.STRING(255),
                allowNull: true
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'delivery_address')) {
            await queryInterface.addColumn(tableName, 'delivery_address', {
                type: Sequelize.TEXT,
                allowNull: true
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'delivery_latitude')) {
            await queryInterface.addColumn(tableName, 'delivery_latitude', {
                type: Sequelize.DECIMAL(10, 8),
                allowNull: true
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'delivery_longitude')) {
            await queryInterface.addColumn(tableName, 'delivery_longitude', {
                type: Sequelize.DECIMAL(11, 8),
                allowNull: true
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'scheduled_for')) {
            await queryInterface.addColumn(tableName, 'scheduled_for', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'special_instructions')) {
            await queryInterface.addColumn(tableName, 'special_instructions', {
                type: Sequelize.TEXT,
                allowNull: true
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'delivery_fee')) {
            await queryInterface.addColumn(tableName, 'delivery_fee', {
                type: Sequelize.DECIMAL(14, 4),
                allowNull: false,
                defaultValue: 0
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'store_customer_id')) {
            await queryInterface.addColumn(tableName, 'store_customer_id', {
                type: Sequelize.INTEGER,
                allowNull: true
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'outside_radius_flag')) {
            await queryInterface.addColumn(tableName, 'outside_radius_flag', {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'accepted_by')) {
            await queryInterface.addColumn(tableName, 'accepted_by', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                }
            });
        }

        if (!await hasColumn(queryInterface, tableName, 'accepted_at')) {
            await queryInterface.addColumn(tableName, 'accepted_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        await addIndexIfMissing(queryInterface, tableName, ['tracking_pin'], {
            name: 'idx_pos_transactions_tracking_pin',
            unique: true
        });
        await addIndexIfMissing(queryInterface, tableName, ['fulfillment_status'], {
            name: 'idx_pos_transactions_fulfillment_status'
        });
        await addIndexIfMissing(queryInterface, tableName, ['location_id'], {
            name: 'idx_pos_transactions_location_id'
        });
        await addIndexIfMissing(queryInterface, tableName, ['order_source'], {
            name: 'idx_pos_transactions_order_source'
        });
        await addIndexIfMissing(queryInterface, tableName, ['store_customer_id'], {
            name: 'idx_pos_transactions_store_customer_id'
        });

        await queryInterface.sequelize.query(`
            UPDATE pos_transactions
            SET fulfillment_status = 'completed'
            WHERE order_source = 'in_store'
              AND fulfillment_status IS NULL
        `);
    },

    down: async (queryInterface, Sequelize) => {
        const tableName = 'pos_transactions';
        if (!await tableExists(queryInterface, tableName)) {
            return;
        }

        await removeIndexIfExists(queryInterface, tableName, 'idx_pos_transactions_store_customer_id');
        await removeIndexIfExists(queryInterface, tableName, 'idx_pos_transactions_order_source');
        await removeIndexIfExists(queryInterface, tableName, 'idx_pos_transactions_location_id');
        await removeIndexIfExists(queryInterface, tableName, 'idx_pos_transactions_fulfillment_status');
        await removeIndexIfExists(queryInterface, tableName, 'idx_pos_transactions_tracking_pin');

        const columnsToDrop = [
            'accepted_at',
            'accepted_by',
            'outside_radius_flag',
            'store_customer_id',
            'delivery_fee',
            'special_instructions',
            'scheduled_for',
            'delivery_longitude',
            'delivery_latitude',
            'delivery_address',
            'customer_email',
            'customer_phone',
            'customer_name',
            'tracking_pin',
            'location_id',
            'fulfillment_status',
            'order_source'
        ];

        for (const columnName of columnsToDrop) {
            if (await hasColumn(queryInterface, tableName, columnName)) {
                await queryInterface.removeColumn(tableName, columnName);
            }
        }

        await queryInterface.changeColumn(tableName, 'cashier_id', {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'user_id'
            }
        });
    }
};
