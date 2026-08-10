module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableDefinition = await queryInterface.describeTable('job_orders');

        if (!tableDefinition.archived_at) {
            await queryInterface.addColumn('job_orders', 'archived_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!tableDefinition.archived_by) {
            await queryInterface.addColumn('job_orders', 'archived_by', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            });
        }
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('job_orders', 'archived_by');
        await queryInterface.removeColumn('job_orders', 'archived_at');
    }
};
