import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DeliveryRunRemittanceAllocation = sequelize.define('DeliveryRunRemittanceAllocation', {
    delivery_run_remittance_allocation_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    delivery_run_remittance_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    pos_transaction_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    delivery_personnel_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    delivery_personnel_name: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    expected_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    remitted_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    variance_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    }
}, {
    tableName: 'delivery_run_remittance_allocations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
        {
            name: 'uq_delivery_run_remittance_allocation_transaction',
            fields: ['delivery_run_remittance_id', 'pos_transaction_id'],
            unique: true
        },
        { fields: ['pos_transaction_id'] }
    ]
});

export default DeliveryRunRemittanceAllocation;
