// Landlord-DB-only tables (issue #178 Phase 13): the curated Store Template
// catalog. Never cloned into a tenant database - see NON_TENANT_MODEL_EXPORTS
// in backend/src/utils/tenantModelFactory.js and ADR 0056 clause 5.

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).some((entry) => {
        const value = typeof entry === 'string'
            ? entry
            : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase() === String(tableName).toLowerCase();
    });
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
    if (options.name && await hasIndex(queryInterface, tableName, options.name)) return;
    await queryInterface.addIndex(tableName, columns, options);
};

const removeIndexIfExists = async (queryInterface, tableName, indexName) => {
    if (await hasIndex(queryInterface, tableName, indexName)) {
        await queryInterface.removeIndex(tableName, indexName);
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!await tableExists(queryInterface, 'store_configuration_templates')) {
            await queryInterface.createTable('store_configuration_templates', {
                template_id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                template_key: {
                    type: Sequelize.STRING(80),
                    allowNull: false,
                    unique: true
                },
                label: {
                    type: Sequelize.STRING(150),
                    allowNull: false
                },
                version: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 1
                },
                status: {
                    type: Sequelize.ENUM('draft', 'published', 'deprecated'),
                    allowNull: false,
                    defaultValue: 'draft'
                },
                base_mode: {
                    type: Sequelize.STRING(64),
                    allowNull: false
                },
                is_preset: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                visibility: {
                    type: Sequelize.ENUM('visible', 'hidden'),
                    allowNull: false,
                    defaultValue: 'visible'
                },
                owner: {
                    type: Sequelize.STRING(150),
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
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });
        }

        await addIndexIfMissing(queryInterface, 'store_configuration_templates', ['template_key'], {
            name: 'idx_store_configuration_templates_key',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'store_configuration_templates', ['base_mode', 'status'], {
            name: 'idx_store_configuration_templates_mode_status'
        });

        if (!await tableExists(queryInterface, 'store_configuration_template_modules')) {
            await queryInterface.createTable('store_configuration_template_modules', {
                id: {
                    type: Sequelize.BIGINT,
                    autoIncrement: true,
                    primaryKey: true
                },
                template_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'store_configuration_templates', key: 'template_id' },
                    onDelete: 'CASCADE',
                    onUpdate: 'CASCADE'
                },
                module_key: {
                    type: Sequelize.STRING(80),
                    allowNull: false
                },
                enabled: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true
                },
                config: {
                    type: Sequelize.JSON,
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
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });
        }

        await addIndexIfMissing(queryInterface, 'store_configuration_template_modules', ['template_id', 'module_key'], {
            name: 'idx_store_configuration_template_modules_unique',
            unique: true
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'store_configuration_template_modules')) {
            await removeIndexIfExists(queryInterface, 'store_configuration_template_modules', 'idx_store_configuration_template_modules_unique');
            await queryInterface.dropTable('store_configuration_template_modules');
        }
        if (await tableExists(queryInterface, 'store_configuration_templates')) {
            await removeIndexIfExists(queryInterface, 'store_configuration_templates', 'idx_store_configuration_templates_key');
            await removeIndexIfExists(queryInterface, 'store_configuration_templates', 'idx_store_configuration_templates_mode_status');
            await queryInterface.dropTable('store_configuration_templates');
        }
        if (queryInterface.sequelize.getDialect() === 'mysql') {
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_store_configuration_templates_status').catch(() => {});
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_store_configuration_templates_visibility').catch(() => {});
        }
    }
};
