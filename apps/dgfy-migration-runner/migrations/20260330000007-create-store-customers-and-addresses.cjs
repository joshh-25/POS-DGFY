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

const hasConstraint = async (queryInterface, tableName, constraintName) => {
    try {
        const [rows] = await queryInterface.sequelize.query(
            `
                SELECT CONSTRAINT_NAME
                FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND CONSTRAINT_NAME = ?
                LIMIT 1
            `,
            {
                replacements: [tableName, constraintName]
            }
        );
        return Array.isArray(rows) && rows.length > 0;
    } catch {
        return false;
    }
};

const addConstraintIfMissing = async (queryInterface, tableName, options = {}) => {
    if (!options.name) {
        await queryInterface.addConstraint(tableName, options);
        return;
    }
    if (await hasConstraint(queryInterface, tableName, options.name)) {
        return;
    }
    await queryInterface.addConstraint(tableName, options);
};

const removeConstraintIfExists = async (queryInterface, tableName, constraintName) => {
    if (await hasConstraint(queryInterface, tableName, constraintName)) {
        await queryInterface.removeConstraint(tableName, constraintName);
    }
};

module.exports = {
    up: async (queryInterface, Sequelize) => {
        if (!await tableExists(queryInterface, 'store_customers')) {
            await queryInterface.createTable('store_customers', {
                customer_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                email: {
                    type: Sequelize.STRING(255),
                    allowNull: false,
                    unique: true
                },
                password_hash: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                name: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                phone: {
                    type: Sequelize.STRING(50),
                    allowNull: true
                },
                is_active: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true
                },
                last_login: {
                    type: Sequelize.DATE,
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
        }

        if (!await tableExists(queryInterface, 'customer_addresses')) {
            await queryInterface.createTable('customer_addresses', {
                address_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                customer_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'store_customers',
                        key: 'customer_id'
                    },
                    onDelete: 'CASCADE',
                    onUpdate: 'CASCADE'
                },
                label: {
                    type: Sequelize.STRING(100),
                    allowNull: false,
                    defaultValue: 'Address'
                },
                address_line: {
                    type: Sequelize.TEXT,
                    allowNull: false
                },
                latitude: {
                    type: Sequelize.DECIMAL(10, 8),
                    allowNull: true
                },
                longitude: {
                    type: Sequelize.DECIMAL(11, 8),
                    allowNull: true
                },
                is_default: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
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

        await addIndexIfMissing(queryInterface, 'store_customers', ['email'], {
            name: 'idx_store_customers_email',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'store_customers', ['is_active'], {
            name: 'idx_store_customers_active'
        });
        await addIndexIfMissing(queryInterface, 'customer_addresses', ['customer_id'], {
            name: 'idx_customer_addresses_customer'
        });
        await addIndexIfMissing(queryInterface, 'customer_addresses', ['customer_id', 'is_default'], {
            name: 'idx_customer_addresses_default'
        });

        if (
            await tableExists(queryInterface, 'pos_transactions')
            && await hasColumn(queryInterface, 'pos_transactions', 'store_customer_id')
        ) {
            await addConstraintIfMissing(queryInterface, 'pos_transactions', {
                fields: ['store_customer_id'],
                type: 'foreign key',
                name: 'fk_pos_transactions_store_customer_id',
                references: {
                    table: 'store_customers',
                    field: 'customer_id'
                },
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });
        }
    },

    down: async (queryInterface) => {
        if (await tableExists(queryInterface, 'pos_transactions')) {
            await removeConstraintIfExists(queryInterface, 'pos_transactions', 'fk_pos_transactions_store_customer_id');
        }

        if (await tableExists(queryInterface, 'customer_addresses')) {
            await removeIndexIfExists(queryInterface, 'customer_addresses', 'idx_customer_addresses_default');
            await removeIndexIfExists(queryInterface, 'customer_addresses', 'idx_customer_addresses_customer');
            await queryInterface.dropTable('customer_addresses');
        }

        if (await tableExists(queryInterface, 'store_customers')) {
            await removeIndexIfExists(queryInterface, 'store_customers', 'idx_store_customers_active');
            await removeIndexIfExists(queryInterface, 'store_customers', 'idx_store_customers_email');
            await queryInterface.dropTable('store_customers');
        }
    }
};
