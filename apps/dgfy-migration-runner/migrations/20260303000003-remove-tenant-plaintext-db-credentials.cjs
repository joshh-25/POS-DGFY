'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable('tenants');

        if (table.db_username) {
            await queryInterface.removeColumn('tenants', 'db_username');
        }

        if (table.db_password) {
            await queryInterface.removeColumn('tenants', 'db_password');
        }
    },

    async down(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable('tenants');

        if (!table.db_username) {
            await queryInterface.addColumn('tenants', 'db_username', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }

        if (!table.db_password) {
            await queryInterface.addColumn('tenants', 'db_password', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }
    }
};
