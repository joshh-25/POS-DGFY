import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class GeoStoreItem extends Model {}

    GeoStoreItem.init({
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        location_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true
        },
        item_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false
        },
        price: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true
        },
        quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        in_stock: {
            type: DataTypes.TINYINT(1),
            allowNull: false,
            defaultValue: 1
        },
        last_updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'GeoStoreItem',
        tableName: 'geo_store_items',
        underscored: true,
        timestamps: true
    });

    return GeoStoreItem;
};
