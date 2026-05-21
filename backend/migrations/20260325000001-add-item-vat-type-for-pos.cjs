module.exports = {
    up: async (queryInterface, Sequelize) => {
        const table = await queryInterface.describeTable('items');

        if (!table.vat_type) {
            await queryInterface.addColumn('items', 'vat_type', {
                type: Sequelize.ENUM('vatable', 'vat_exempt', 'zero_rated'),
                allowNull: false,
                defaultValue: 'vatable'
            });
        }
    },

    down: async (queryInterface) => {
        const table = await queryInterface.describeTable('items');
        if (table.vat_type) {
            await queryInterface.removeColumn('items', 'vat_type');
        }
    }
};

