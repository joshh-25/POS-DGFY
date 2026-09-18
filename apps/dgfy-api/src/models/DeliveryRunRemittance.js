import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DeliveryRunRemittance = sequelize.define('DeliveryRunRemittance', {
    delivery_run_remittance_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    delivery_run_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
    },
    location_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    confirmed_by: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    confirmed_at: {
        type: DataTypes.DATE,
        allowNull: false
    },
    total_expected_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    total_remitted_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    total_variance_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    }
}, {
    tableName: 'delivery_run_remittances',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['delivery_run_id'], unique: true },
        { fields: ['location_id', 'confirmed_at'] }
    ]
});

export default DeliveryRunRemittance;
