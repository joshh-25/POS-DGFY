
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));

        if (!tableInfo.last_expiry_notified_at) {
            await queryInterface.addColumn('tenants', 'last_expiry_notified_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!tableInfo.last_expiry_notification_type) {
            await queryInterface.addColumn('tenants', 'last_expiry_notification_type', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('tenants', 'last_expiry_notified_at');
        await queryInterface.removeColumn('tenants', 'last_expiry_notification_type');
    }
};
