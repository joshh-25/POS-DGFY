/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        const existingTables = new Set(
            tables.map((table) => (typeof table === 'object' ? table.tableName || table.name : table))
        );

        if (!existingTables.has('geo_store_items')) return;

        const columns = await queryInterface.describeTable('geo_store_items');
        if (!columns.sku_code) {
            await queryInterface.addColumn('geo_store_items', 'sku_code', {
                type: Sequelize.STRING(100),
                allowNull: true,
                after: 'item_id'
            });
        }
    },

    async down(queryInterface) {
        const tables = await queryInterface.showAllTables();
        const existingTables = new Set(
            tables.map((table) => (typeof table === 'object' ? table.tableName || table.name : table))
        );

        if (!existingTables.has('geo_store_items')) return;

        const columns = await queryInterface.describeTable('geo_store_items');
        if (columns.sku_code) {
            await queryInterface.removeColumn('geo_store_items', 'sku_code');
        }
    }
};
