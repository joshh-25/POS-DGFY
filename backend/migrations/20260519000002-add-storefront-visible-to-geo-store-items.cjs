/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDesc = await queryInterface.describeTable('geo_store_items').catch(() => null);
        if (!tableDesc) return; // geo_store_items not yet created — initial migration handles it

        if (!tableDesc.storefront_visible) {
            await queryInterface.addColumn('geo_store_items', 'storefront_visible', {
                type: Sequelize.TINYINT(1),
                allowNull: false,
                defaultValue: 1,
                after: 'in_stock'
            });

            await queryInterface.addIndex('geo_store_items', ['storefront_visible'], {
                name: 'idx_geo_store_items_storefront_visible'
            });
        }
    },

    async down(queryInterface) {
        const tableDesc = await queryInterface.describeTable('geo_store_items').catch(() => null);
        if (!tableDesc?.storefront_visible) return;

        await queryInterface.removeIndex('geo_store_items', 'idx_geo_store_items_storefront_visible').catch(() => {});
        await queryInterface.removeColumn('geo_store_items', 'storefront_visible');
    }
};
