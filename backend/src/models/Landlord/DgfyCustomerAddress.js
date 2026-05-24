import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyCustomerAddress extends Model { }

    DgfyCustomerAddress.init({
        address_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        label: {
            type: DataTypes.STRING(100),
            allowNull: false,
            defaultValue: 'Address'
        },
        address_line: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        latitude: {
            type: DataTypes.DECIMAL(10, 8),
            allowNull: true
        },
        longitude: {
            type: DataTypes.DECIMAL(11, 8),
            allowNull: true
        },
        is_default: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        sequelize,
        modelName: 'DgfyCustomerAddress',
        tableName: 'dgfy_customer_addresses',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['dgfy_account_id', 'is_default'], name: 'idx_dgfy_customer_addresses_default' }
        ]
    });

    return DgfyCustomerAddress;
};
