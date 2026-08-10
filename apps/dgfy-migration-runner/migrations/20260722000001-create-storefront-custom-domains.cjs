'use strict';

const normalizeTableName = (table) => {
    if (!table) return '';
    if (typeof table === 'string') return table;
    return table.tableName || table.table_name || String(table);
};

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).map(normalizeTableName)
        .some((name) => String(name).toLowerCase() === tableName.toLowerCase());
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!await tableExists(queryInterface, 'storefront_custom_domains')) {
            await queryInterface.createTable('storefront_custom_domains', {
                id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: { model: 'tenants', key: 'id' },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                hostname: { type: Sequelize.STRING(253), allowNull: false, unique: true },
                role: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'canonical' },
                canonical_tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: true,
                    unique: true
                },
                status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'pending_dns' },
                verification_token_hash: { type: Sequelize.STRING(64), allowNull: false },
                verification_token_hint: { type: Sequelize.STRING(16), allowNull: false },
                dns_observation: { type: Sequelize.JSON, allowNull: true },
                dns_error: { type: Sequelize.STRING(500), allowNull: true },
                verified_at: { type: Sequelize.DATE, allowNull: true },
                activated_at: { type: Sequelize.DATE, allowNull: true },
                suspended_at: { type: Sequelize.DATE, allowNull: true },
                removed_at: { type: Sequelize.DATE, allowNull: true },
                provisioning_reference: { type: Sequelize.STRING(255), allowNull: true },
                created_by: { type: Sequelize.STRING(120), allowNull: false },
                updated_by: { type: Sequelize.STRING(120), allowNull: false },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
            });
            await queryInterface.addIndex('storefront_custom_domains', ['tenant_id', 'role'], {
                name: 'idx_storefront_custom_domains_tenant_role'
            });
            await queryInterface.addIndex('storefront_custom_domains', ['status', 'hostname'], {
                name: 'idx_storefront_custom_domains_status_hostname'
            });
        }

        if (!await tableExists(queryInterface, 'storefront_custom_domain_audit_logs')) {
            await queryInterface.createTable('storefront_custom_domain_audit_logs', {
                id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
                domain_id: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: { model: 'storefront_custom_domains', key: 'id' },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: { model: 'tenants', key: 'id' },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                action: { type: Sequelize.STRING(32), allowNull: false },
                actor_username: { type: Sequelize.STRING(120), allowNull: false },
                reason: { type: Sequelize.STRING(500), allowNull: false },
                request_id: { type: Sequelize.STRING(100), allowNull: true },
                before_snapshot: { type: Sequelize.JSON, allowNull: true },
                after_snapshot: { type: Sequelize.JSON, allowNull: true },
                metadata: { type: Sequelize.JSON, allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
            });
            await queryInterface.addIndex('storefront_custom_domain_audit_logs', ['domain_id', 'created_at'], {
                name: 'idx_storefront_domain_audit_domain_time'
            });
            await queryInterface.addIndex('storefront_custom_domain_audit_logs', ['tenant_id', 'created_at'], {
                name: 'idx_storefront_domain_audit_tenant_time'
            });
        }
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'storefront_custom_domain_audit_logs')) {
            await queryInterface.dropTable('storefront_custom_domain_audit_logs');
        }
        if (await tableExists(queryInterface, 'storefront_custom_domains')) {
            await queryInterface.dropTable('storefront_custom_domains');
        }
    }
};
