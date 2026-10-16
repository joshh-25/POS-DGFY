module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Add 'POS_PARKED_SALE' to reference_type ENUM — must list ALL existing values.
        // apps/dgfy-api/src/modules/pos/usecases/parkedSaleUseCases.js writes this literal for
        // parked-sale goods-issue stock movements, but it was never added to this enum
        // (#2321 — "Data truncated for column 'reference_type' at row 1" on POS re-park).
        await queryInterface.changeColumn('stock_movements', 'reference_type', {
            type: Sequelize.ENUM('PO', 'JO', 'MANUAL', 'RETURN', 'DO', 'POS', 'POS_PARKED_SALE'),
            defaultValue: 'MANUAL'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.sequelize.query(
            "UPDATE stock_movements SET reference_type = 'POS' WHERE reference_type = 'POS_PARKED_SALE'"
        );

        await queryInterface.changeColumn('stock_movements', 'reference_type', {
            type: Sequelize.ENUM('PO', 'JO', 'MANUAL', 'RETURN', 'DO', 'POS'),
            defaultValue: 'MANUAL'
        });
    }
};
