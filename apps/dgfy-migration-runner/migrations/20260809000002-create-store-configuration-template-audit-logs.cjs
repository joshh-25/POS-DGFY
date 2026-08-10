// Landlord-DB-only (issue #178 Phase 14): audit trail for every curation
// write against store_configuration_templates. Never cloned into a tenant
// database - see NON_TENANT_MODEL_EXPORTS.

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
        if (!await tableExists(queryInterface, 'store_configuration_template_audit_logs')) {
            await queryInterface.createTable('store_configuration_template_audit_logs', {
                audit_log_id: {
                    type: Sequelize.BIGINT,
                    autoIncrement: true,
                    primaryKey: true
                },
                template_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'store_configuration_templates', key: 'template_id' }
                },
                action: {
                    type: Sequelize.ENUM('draft_created', 'modules_updated', 'published', 'deprecated'),
                    allowNull: false
                },
                actor_username: {
                    type: Sequelize.STRING(120),
                    allowNull: false
                },
                reason: {
                    type: Sequelize.STRING(500),
                    allowNull: true
                },
                before_snapshot: {
                    type: Sequelize.JSON,
                    allowNull: true
                },
                after_snapshot: {
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

        await addIndexIfMissing(queryInterface, 'store_configuration_template_audit_logs', ['template_id', 'created_at'], {
            name: 'idx_store_config_template_audit_template_time'
        });
        await addIndexIfMissing(queryInterface, 'store_configuration_template_audit_logs', ['action'], {
            name: 'idx_store_config_template_audit_action'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'store_configuration_template_audit_logs')) {
            await removeIndexIfExists(queryInterface, 'store_configuration_template_audit_logs', 'idx_store_config_template_audit_template_time');
            await removeIndexIfExists(queryInterface, 'store_configuration_template_audit_logs', 'idx_store_config_template_audit_action');
            await queryInterface.dropTable('store_configuration_template_audit_logs');
        }
        if (queryInterface.sequelize.getDialect() === 'mysql') {
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_store_configuration_template_audit_logs_action').catch(() => {});
        }
    }
};
