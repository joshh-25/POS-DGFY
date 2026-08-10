// Landlord-DB-only (issue #178 Phase 20). Adds the column
// findPublishedCanonicalForMode needs to stop guessing "canonical" from
// insertion order (see storeConfigurationTemplateRepository.js). Never
// cloned into a tenant database - see NON_TENANT_MODEL_EXPORTS in
// apps/dgfy-api/src/utils/tenantModelFactory.js and ADR 0056 clause 5.

const hasColumn = async (queryInterface, tableName, columnName) => {
    try {
        const description = await queryInterface.describeTable(tableName);
        return Object.prototype.hasOwnProperty.call(description, columnName);
    } catch {
        return false;
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!await hasColumn(queryInterface, 'store_configuration_templates', 'is_canonical')) {
            await queryInterface.addColumn('store_configuration_templates', 'is_canonical', {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            });
        }
    },

    async down(queryInterface) {
        if (await hasColumn(queryInterface, 'store_configuration_templates', 'is_canonical')) {
            await queryInterface.removeColumn('store_configuration_templates', 'is_canonical');
        }
    }
};
