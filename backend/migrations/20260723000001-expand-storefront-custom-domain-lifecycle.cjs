'use strict';

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).some((table) => {
        const name = typeof table === 'string' ? table : table?.tableName || table?.table_name;
        return String(name || '').toLowerCase() === tableName.toLowerCase();
    });
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
    const description = await queryInterface.describeTable(tableName);
    if (!description[columnName]) {
        await queryInterface.addColumn(tableName, columnName, definition);
    }
};

const removeColumnIfPresent = async (queryInterface, tableName, columnName) => {
    const description = await queryInterface.describeTable(tableName);
    if (description[columnName]) {
        await queryInterface.removeColumn(tableName, columnName);
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!await tableExists(queryInterface, 'storefront_custom_domains')) {
            throw new Error('storefront_custom_domains must exist before expanding its lifecycle contract.');
        }

        await addColumnIfMissing(queryInterface, 'storefront_custom_domains', 'canonical_domain_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'storefront_custom_domains', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });
        await addColumnIfMissing(queryInterface, 'storefront_custom_domains', 'eligibility_grace_ends_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'storefront_custom_domains', 'last_dns_checked_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'storefront_custom_domains', 'last_health_checked_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'storefront_custom_domains', 'tls_expires_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'storefront_custom_domains', 'failure_code', {
            type: Sequelize.STRING(64),
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'storefront_custom_domains', 'failure_message', {
            type: Sequelize.STRING(500),
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'storefront_custom_domains', 'version', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        });

        if (!await tableExists(queryInterface, 'storefront_custom_domain_operations')) {
            await queryInterface.createTable('storefront_custom_domain_operations', {
                id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
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
                operation_type: { type: Sequelize.STRING(24), allowNull: false },
                idempotency_key: { type: Sequelize.STRING(160), allowNull: false, unique: true },
                status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'queued' },
                lease_owner: { type: Sequelize.STRING(120), allowNull: true },
                lease_expires_at: { type: Sequelize.DATE, allowNull: true },
                attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                max_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 5 },
                next_attempt_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                request_payload: { type: Sequelize.JSON, allowNull: true },
                result_payload: { type: Sequelize.JSON, allowNull: true },
                error_code: { type: Sequelize.STRING(64), allowNull: true },
                error_message: { type: Sequelize.STRING(500), allowNull: true },
                completed_at: { type: Sequelize.DATE, allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
            });
            await queryInterface.addIndex('storefront_custom_domain_operations', ['status', 'next_attempt_at'], {
                name: 'idx_storefront_domain_operations_ready'
            });
            await queryInterface.addIndex('storefront_custom_domain_operations', ['domain_id', 'created_at'], {
                name: 'idx_storefront_domain_operations_domain_time'
            });
            await queryInterface.addIndex('storefront_custom_domain_operations', ['tenant_id', 'created_at'], {
                name: 'idx_storefront_domain_operations_tenant_time'
            });
        }
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'storefront_custom_domain_operations')) {
            await queryInterface.dropTable('storefront_custom_domain_operations');
        }
        if (!await tableExists(queryInterface, 'storefront_custom_domains')) return;

        for (const column of [
            'version',
            'failure_message',
            'failure_code',
            'tls_expires_at',
            'last_health_checked_at',
            'last_dns_checked_at',
            'eligibility_grace_ends_at',
            'canonical_domain_id'
        ]) {
            await removeColumnIfPresent(queryInterface, 'storefront_custom_domains', column);
        }
    }
};
