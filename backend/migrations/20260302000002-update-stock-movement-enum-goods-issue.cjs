module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Add 'goods_issue' to movement_type ENUM — must list ALL existing values
        await queryInterface.changeColumn('stock_movements', 'movement_type', {
            type: Sequelize.ENUM(
                'production_consumption',
                'purchase_receipt',
                'return',
                'transfer',
                'calculated_loss',
                'adjustment',
                'production_output',
                'goods_issue'
            ),
            allowNull: false
        });

        // Add 'DO' to reference_type ENUM — must list ALL existing values
        await queryInterface.changeColumn('stock_movements', 'reference_type', {
            type: Sequelize.ENUM('PO', 'JO', 'MANUAL', 'RETURN', 'DO'),
            defaultValue: 'MANUAL'
        });
    },

    down: async (queryInterface, Sequelize) => {
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

        await queryInterface.changeColumn('stock_movements', 'reference_type', {
            type: Sequelize.ENUM('PO', 'JO', 'MANUAL', 'RETURN'),
            defaultValue: 'MANUAL'
        });
    }
};
