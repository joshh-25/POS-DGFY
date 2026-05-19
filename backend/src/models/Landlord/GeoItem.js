import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class GeoItem extends Model {}

    GeoItem.init({
        geo_item_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        normalized_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        category: {
            type: DataTypes.STRING(100),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'GeoItem',
        tableName: 'geo_items',
        underscored: true,
        timestamps: true
    });

    return GeoItem;
};
