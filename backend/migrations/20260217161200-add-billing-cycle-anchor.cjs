
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));

        if (!tableInfo.billing_cycle_anchor) {
            await queryInterface.addColumn('tenants', 'billing_cycle_anchor', {
                type: Sequelize.INTEGER,
                allowNull: true,
                validate: {
                    min: 1,
                    max: 31
                }
            });
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('tenants', 'billing_cycle_anchor');
    }
};
