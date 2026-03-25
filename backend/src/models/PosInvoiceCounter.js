import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosInvoiceCounter = sequelize.define('PosInvoiceCounter', {
    counter_key: {
        type: DataTypes.STRING(50),
        primaryKey: true
    },
    current_value: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    }
}, {
    tableName: 'pos_invoice_counters',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

export default PosInvoiceCounter;

