module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('job_orders', 'archived_at', {
            type: Sequelize.DATE,
            allowNull: true
        });

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
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('job_orders', 'archived_by');
        await queryInterface.removeColumn('job_orders', 'archived_at');
    }
};
