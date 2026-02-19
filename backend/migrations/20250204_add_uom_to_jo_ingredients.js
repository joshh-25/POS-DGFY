
import { DataTypes } from 'sequelize';

export default {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('jo_ingredients', 'unit_of_measure', {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: 'Recipe UOM used for quantity_required'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('jo_ingredients', 'unit_of_measure');
    }
};
