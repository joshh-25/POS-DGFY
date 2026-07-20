module.exports = {
    up: async (queryInterface, Sequelize) => {
        // We must list ALL enum values, old and new
        await queryInterface.changeColumn('stock_movements', 'movement_type', {
            type: Sequelize.ENUM(
                'production_consumption',
                'purchase_receipt',
                'return',
                'transfer',
                'calculated_loss',
                'adjustment',
                'production_output'
            ),
            allowNull: false
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('stock_movements', 'movement_type', {
            type: Sequelize.ENUM('production_consumption', 'purchase_receipt', 'return', 'transfer', 'calculated_loss'),
            allowNull: false
        });
    }
};
