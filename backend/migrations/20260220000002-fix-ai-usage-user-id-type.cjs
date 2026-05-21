'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.changeColumn('ai_usage_logs', 'user_id', {
            type: Sequelize.INTEGER,
            allowNull: false
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.changeColumn('ai_usage_logs', 'user_id', {
            type: Sequelize.UUID,
            allowNull: false
        });
    }
};
