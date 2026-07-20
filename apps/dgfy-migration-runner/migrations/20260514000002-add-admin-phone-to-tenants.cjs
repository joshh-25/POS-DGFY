'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));
        if (!tableInfo || Object.keys(tableInfo).length === 0) {
            return;
        }

        if (!tableInfo.admin_phone) {
            await queryInterface.addColumn('tenants', 'admin_phone', {
                type: Sequelize.STRING(40),
                allowNull: true
            });
        }
    },

    async down(queryInterface) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));
        if (tableInfo.admin_phone) {
            await queryInterface.removeColumn('tenants', 'admin_phone');
        }
    }
};
