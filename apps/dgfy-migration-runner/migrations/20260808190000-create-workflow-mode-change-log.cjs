'use strict';

/**
 * Additive-only (issue #178 Phase 5 / mode-switch hardening): tenant-scoped,
 * append-only audit trail for ops_workflow_mode / ops_enabled_capabilities
 * changes. Neither setting carries a change history today - SystemSetting
 * has no updated_by column and no history table.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        if (tables.includes('workflow_mode_change_log')) return;

        await queryInterface.createTable('workflow_mode_change_log', {
            workflow_mode_change_log_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            actor_user_id: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            actor_username_snapshot: {
                type: Sequelize.STRING(150),
                allowNull: true
            },
            from_workflow_mode: {
                type: Sequelize.STRING(64),
                allowNull: true
            },
            to_workflow_mode: {
                type: Sequelize.STRING(64),
                allowNull: true
            },
            from_enabled_capabilities: {
                type: Sequelize.JSON,
                allowNull: true
            },
            to_enabled_capabilities: {
                type: Sequelize.JSON,
                allowNull: true
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            }
        });

        await queryInterface.addIndex('workflow_mode_change_log', ['created_at']);
    },

    async down(queryInterface) {
        const tables = await queryInterface.showAllTables();
        if (tables.includes('workflow_mode_change_log')) {
            await queryInterface.dropTable('workflow_mode_change_log');
        }
    }
};
