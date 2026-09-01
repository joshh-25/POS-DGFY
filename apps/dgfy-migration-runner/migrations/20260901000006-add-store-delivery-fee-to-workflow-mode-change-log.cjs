'use strict';

/**
 * Additive-only (issue #1327 Phase 234 / delivery-pricing settings audit
 * trail): workflow_mode_change_log already records from/to
 * ops_workflow_mode and the ops_enabled_capabilities / ops_disabled_capabilities
 * overlays; this adds the same from/to pair for store_delivery_fee_mode and
 * store_delivery_fee_calc (issue #233's keys) so a delivery-pricing settings
 * change is auditable the same way a workflow-mode switch already is.
 *
 * Nullable, no backfill: existing rows predate this pair and correctly
 * render as "no delivery-fee change recorded" rather than an inferred value.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('workflow_mode_change_log');

        if (!tableDefinition.from_store_delivery_fee_mode) {
            await queryInterface.addColumn('workflow_mode_change_log', 'from_store_delivery_fee_mode', {
                type: Sequelize.STRING(64),
                allowNull: true
            });
        }

        if (!tableDefinition.to_store_delivery_fee_mode) {
            await queryInterface.addColumn('workflow_mode_change_log', 'to_store_delivery_fee_mode', {
                type: Sequelize.STRING(64),
                allowNull: true
            });
        }

        if (!tableDefinition.from_store_delivery_fee_calc) {
            await queryInterface.addColumn('workflow_mode_change_log', 'from_store_delivery_fee_calc', {
                type: Sequelize.JSON,
                allowNull: true
            });
        }

        if (!tableDefinition.to_store_delivery_fee_calc) {
            await queryInterface.addColumn('workflow_mode_change_log', 'to_store_delivery_fee_calc', {
                type: Sequelize.JSON,
                allowNull: true
            });
        }
    },

    async down(queryInterface) {
        const tableDefinition = await queryInterface.describeTable('workflow_mode_change_log');

        if (tableDefinition.from_store_delivery_fee_mode) {
            await queryInterface.removeColumn('workflow_mode_change_log', 'from_store_delivery_fee_mode');
        }
        if (tableDefinition.to_store_delivery_fee_mode) {
            await queryInterface.removeColumn('workflow_mode_change_log', 'to_store_delivery_fee_mode');
        }
        if (tableDefinition.from_store_delivery_fee_calc) {
            await queryInterface.removeColumn('workflow_mode_change_log', 'from_store_delivery_fee_calc');
        }
        if (tableDefinition.to_store_delivery_fee_calc) {
            await queryInterface.removeColumn('workflow_mode_change_log', 'to_store_delivery_fee_calc');
        }
    }
};
