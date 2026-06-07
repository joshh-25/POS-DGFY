'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('tenant_admin_audit_logs', {
            tenant_admin_audit_log_id: {
                type: Sequelize.BIGINT,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            tenant_id: {
                type: Sequelize.INTEGER,
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

        await queryInterface.addIndex('tenant_admin_audit_logs', ['tenant_id', 'created_at'], {
            name: 'idx_tenant_admin_audit_tenant_time'
        });
        await queryInterface.addIndex('tenant_admin_audit_logs', ['action'], {
            name: 'idx_tenant_admin_audit_action'
        });
        await queryInterface.addIndex('tenant_admin_audit_logs', ['actor_username'], {
            name: 'idx_tenant_admin_audit_actor'
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('tenant_admin_audit_logs');
        if (queryInterface.sequelize.getDialect() === 'postgres') {
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_tenant_admin_audit_logs_action;');
        }
    }
};
