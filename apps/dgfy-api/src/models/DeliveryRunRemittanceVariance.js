import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DeliveryRunRemittanceVariance = sequelize.define('DeliveryRunRemittanceVariance', {
    delivery_run_remittance_variance_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    delivery_run_remittance_allocation_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    entry_type: {
        type: DataTypes.ENUM('original', 'reversal'),
        allowNull: false
    },
    reversal_of_variance_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    direction: {
        type: DataTypes.ENUM('shortage', 'overage'),
        allowNull: false
    },
    amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    reason: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    recorded_by: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    recorded_at: {
        type: DataTypes.DATE,
        allowNull: false
    }
}, {
    tableName: 'delivery_run_remittance_variances',
    timestamps: false,
    indexes: [
        {
            name: 'idx_delivery_run_remittance_variances_allocation',
            fields: ['delivery_run_remittance_allocation_id']
        },
        {
            name: 'idx_delivery_run_remittance_variances_reversal',
            fields: ['reversal_of_variance_id']
        }
    ]
});

export default DeliveryRunRemittanceVariance;
