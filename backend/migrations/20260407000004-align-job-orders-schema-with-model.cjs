'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('job_orders').catch(() => ({}));
        if (!tableInfo || Object.keys(tableInfo).length === 0) {
            return;
        }

        if (!tableInfo.quality_check) {
            await queryInterface.addColumn('job_orders', 'quality_check', {
                type: Sequelize.ENUM('pass', 'fail', 'pending'),
                allowNull: true,
                defaultValue: null
            });
        }

        if (tableInfo.quantity_produced) {
            await queryInterface.changeColumn('job_orders', 'quantity_produced', {
                type: Sequelize.DECIMAL(24, 12),
                allowNull: false,
                defaultValue: 0
            });
        }
    },

    async down(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('job_orders').catch(() => ({}));
        if (!tableInfo || Object.keys(tableInfo).length === 0) {
            return;
        }

        if (tableInfo.quantity_produced) {
            await queryInterface.changeColumn('job_orders', 'quantity_produced', {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
                defaultValue: 0
            });
        }

        if (tableInfo.quality_check) {
            await queryInterface.removeColumn('job_orders', 'quality_check');
        }
    }
};
