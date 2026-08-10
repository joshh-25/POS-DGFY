'use strict';

/**
 * Additive-only (issue #178 Phase 16 / subtractive capability overlay):
 * workflow_mode_change_log already records from/to ops_enabled_capabilities;
 * this adds the same pair for the new ops_disabled_capabilities overlay so a
 * template-driven subtraction (Phase 17: apply-template) is auditable the
 * same way an addition already is.
 *
 * Nullable, no backfill: existing rows predate the disabled overlay and
 * correctly render as "no disabled capabilities recorded" rather than an
 * inferred empty array.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('workflow_mode_change_log');

        if (!tableDefinition.from_disabled_capabilities) {
            await queryInterface.addColumn('workflow_mode_change_log', 'from_disabled_capabilities', {
                type: Sequelize.JSON,
                allowNull: true
            });
        }

        if (!tableDefinition.to_disabled_capabilities) {
            await queryInterface.addColumn('workflow_mode_change_log', 'to_disabled_capabilities', {
                type: Sequelize.JSON,
                allowNull: true
            });
        }
    },

    async down(queryInterface) {
        const tableDefinition = await queryInterface.describeTable('workflow_mode_change_log');

        if (tableDefinition.from_disabled_capabilities) {
            await queryInterface.removeColumn('workflow_mode_change_log', 'from_disabled_capabilities');
        }
        if (tableDefinition.to_disabled_capabilities) {
            await queryInterface.removeColumn('workflow_mode_change_log', 'to_disabled_capabilities');
        }
    }
};
