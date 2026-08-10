module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('job_orders', 'jo_number', {
            type: Sequelize.STRING(50),
            allowNull: true,
            unique: true // Keep unique constraint
        });
    },

    down: async (queryInterface, Sequelize) => {
        // Note: This might fail if there are existing null values when reverting
        // Ideally we would fill them first, but for revert logic we accept the risk or add logic
        await queryInterface.changeColumn('job_orders', 'jo_number', {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true
        });
    }
};
