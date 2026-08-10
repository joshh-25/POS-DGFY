import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const StoreCustomerAddress = sequelize.define('StoreCustomerAddress', {
    address_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    customer_id: {
        type: DataTypes.INTEGER,
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
    tableName: 'customer_addresses',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['customer_id'] },
        { fields: ['customer_id', 'is_default'] }
    ]
});

export default StoreCustomerAddress;
