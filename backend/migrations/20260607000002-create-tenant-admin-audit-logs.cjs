'use strict';

const normalizeTableName = (table) => {
    if (!table) return '';
    if (typeof table === 'string') return table;
    return table.tableName || table.table_name || String(table);
};

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || [])
        .map(normalizeTableName)
        .some((name) => String(name).toLowerCase() === String(tableName).toLowerCase());
};

const hasIndex = async (queryInterface, tableName, indexName) => {
    try {
        const indexes = await queryInterface.showIndex(tableName);
        return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
    } catch {
        return false;
    }
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options = {}) => {
    if (options.name && await hasIndex(queryInterface, tableName, options.name)) return;
    await queryInterface.addIndex(tableName, fields, options);
};

const removeIndexIfExists = async (queryInterface, tableName, indexName) => {
    if (await hasIndex(queryInterface, tableName, indexName)) {
        await queryInterface.removeIndex(tableName, indexName);
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!await tableExists(queryInterface, 'tenant_admin_audit_logs')) {
            await queryInterface.createTable('tenant_admin_audit_logs', {
                tenant_admin_audit_log_id: {
                    type: Sequelize.BIGINT,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: {
                        model: 'tenants',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                action: {
                    type: Sequelize.ENUM('capability_update'),
                    allowNull: false
                },
                actor_username: {
                    type: Sequelize.STRING(120),
                    allowNull: false
                },
                reason: {
                    type: Sequelize.STRING(500),
                    allowNull: false
                },
                request_id: {
                    type: Sequelize.STRING(100),
                    allowNull: true
                },
                ip_address: {
                    type: Sequelize.STRING(64),
                    allowNull: true
                },
                user_agent: {
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
                metadata: {
                    type: Sequelize.JSON,
                    allowNull: true,
                    defaultValue: {}
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

        await addIndexIfMissing(queryInterface, 'tenant_admin_audit_logs', ['tenant_id', 'created_at'], {
            name: 'idx_tenant_admin_audit_tenant_time'
        });
        await addIndexIfMissing(queryInterface, 'tenant_admin_audit_logs', ['action'], {
            name: 'idx_tenant_admin_audit_action'
        });
        await addIndexIfMissing(queryInterface, 'tenant_admin_audit_logs', ['actor_username'], {
            name: 'idx_tenant_admin_audit_actor'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'tenant_admin_audit_logs')) {
            await removeIndexIfExists(queryInterface, 'tenant_admin_audit_logs', 'idx_tenant_admin_audit_tenant_time');
            await removeIndexIfExists(queryInterface, 'tenant_admin_audit_logs', 'idx_tenant_admin_audit_action');
            await removeIndexIfExists(queryInterface, 'tenant_admin_audit_logs', 'idx_tenant_admin_audit_actor');
            await queryInterface.dropTable('tenant_admin_audit_logs');
        }
        if (queryInterface.sequelize.getDialect() === 'postgres') {
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_tenant_admin_audit_logs_action;');
        }
    }
};
