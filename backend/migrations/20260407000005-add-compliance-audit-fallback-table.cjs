/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'tenant_compliance_audit_failures'");
        if (Array.isArray(tables) && tables.length > 0) {
            return;
        }

        await queryInterface.createTable('tenant_compliance_audit_failures', {
            tenant_compliance_audit_failure_id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            tenant_id: {
                type: Sequelize.UUID,
                allowNull: true
            },
            event_type: {
                type: Sequelize.STRING(120),
                allowNull: false
            },
            operation: {
                type: Sequelize.STRING(120),
                allowNull: true
            },
            decision: {
                type: Sequelize.STRING(32),
                allowNull: true
            },
            reason_code: {
                type: Sequelize.STRING(120),
                allowNull: true
            },
            actor_user_id: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            audit_payload: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {}
            },
            fallback_context: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {}
            },
            primary_error_message: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            primary_error_name: {
                type: Sequelize.STRING(120),
                allowNull: true
            },
            primary_error_code: {
                type: Sequelize.STRING(120),
                allowNull: true
            },
            resolved_at: {
                type: Sequelize.DATE,
                allowNull: true
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('tenant_compliance_audit_failures', ['tenant_id']);
        await queryInterface.addIndex('tenant_compliance_audit_failures', ['event_type']);
        await queryInterface.addIndex('tenant_compliance_audit_failures', ['created_at']);
        await queryInterface.addIndex('tenant_compliance_audit_failures', ['resolved_at']);
    },

    async down(queryInterface) {
        await queryInterface.dropTable('tenant_compliance_audit_failures').catch(() => null);
    }
};
