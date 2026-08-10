import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class StorefrontHandleReservation extends Model {}

    StorefrontHandleReservation.init({
        storefront_handle_reservation_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        handle: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        source: {
            type: DataTypes.STRING(40),
            allowNull: false,
            defaultValue: 'settings'
        }
    }, {
        sequelize,
        modelName: 'StorefrontHandleReservation',
        tableName: 'storefront_handle_reservations',
        underscored: true,
        timestamps: true,
        indexes: [
            { unique: true, fields: ['handle'] },
            { unique: true, fields: ['tenant_id'] }
        ]
    });

    return StorefrontHandleReservation;
};
