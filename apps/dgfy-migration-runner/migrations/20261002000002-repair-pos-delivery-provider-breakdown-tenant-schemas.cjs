'use strict';

// The original delivery-provider migration was already recorded as applied in some local
// databases before its tenant-scoped ownership was corrected. Re-run the corrected fan-out logic
// under a new migration name so upgraded databases receive the column without rewriting migration
// history. The original migration remains the owner of the schema and therefore this repair has a
// deliberately empty down() path; rolling back the feature uses the original migration's down().

const deliveryProviderMigration = require('./20261002000001-add-pos-delivery-provider-breakdown.cjs');

module.exports = {
    async up(queryInterface) {
        await deliveryProviderMigration.up(queryInterface);
    },

    async down() {
        // No-op: the original migration owns the column. This repair only catches up databases
        // that had already recorded the original migration before the tenant fan-out correction.
    }
};
