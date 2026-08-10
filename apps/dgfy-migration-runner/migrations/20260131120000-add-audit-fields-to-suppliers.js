export default {
    async up(queryInterface, Sequelize) {
        // Check if columns exist first to avoid errors on Tenant A (which has them via sync)
        const tableInfo = await queryInterface.describeTable('suppliers');

        if (!tableInfo.deleted_by) {
            await queryInterface.addColumn('suppliers', 'deleted_by', {
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

        if (!tableInfo.deleted_at) {
            await queryInterface.addColumn('suppliers', 'deleted_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }
    },

    async down(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('suppliers');

        if (tableInfo.deleted_by) {
            await queryInterface.removeColumn('suppliers', 'deleted_by');
        }

        if (tableInfo.deleted_at) {
            await queryInterface.removeColumn('suppliers', 'deleted_at');
        }
    }
};

