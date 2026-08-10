export default {
    async up(queryInterface, Sequelize) {
        // Add received_by column to purchase_orders
        const poTableInfo = await queryInterface.describeTable('purchase_orders');

        if (!poTableInfo.received_by) {
            await queryInterface.addColumn('purchase_orders', 'received_by', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
                comment: 'User who completed the PO receiving'
            });
            console.log('Added received_by column to purchase_orders');
        } else {
            console.log('Column received_by already exists in purchase_orders, skipping');
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('purchase_orders', 'received_by');
    }
};
