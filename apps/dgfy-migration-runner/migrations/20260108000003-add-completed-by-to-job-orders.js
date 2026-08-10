export default {
    async up(queryInterface, Sequelize) {
        // Add completed_by column to job_orders
        const joTableInfo = await queryInterface.describeTable('job_orders');

        if (!joTableInfo.completed_by) {
            await queryInterface.addColumn('job_orders', 'completed_by', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
                comment: 'User who completed the job order'
            });
            console.log('Added completed_by column to job_orders');
        } else {
            console.log('Column completed_by already exists in job_orders, skipping');
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('job_orders', 'completed_by');
    }
};
