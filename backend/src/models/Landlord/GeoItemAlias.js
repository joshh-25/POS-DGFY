import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class GeoItemAlias extends Model {}

    GeoItemAlias.init({
        alias_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },
        item_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false
        },
        alias_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        // NULL = global alias; non-NULL = submitted by a specific tenant (awaiting moderation)
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        moderation_status: {
            type: DataTypes.ENUM('approved', 'pending', 'rejected'),
            allowNull: false,
            defaultValue: 'pending'
        }
    }, {
        sequelize,
        modelName: 'GeoItemAlias',
        tableName: 'geo_item_aliases',
        underscored: true,
        timestamps: true
    });

    return GeoItemAlias;
};
