import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosTransaction = sequelize.define('PosTransaction', {
    pos_transaction_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    invoice_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    idempotency_key: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true
    },
    request_hash: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    cashier_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    order_method: {
        type: DataTypes.ENUM('dine_in', 'takeout', 'delivery', 'online'),
        allowNull: false,
        defaultValue: 'dine_in'
    },
    payment_type: {
        type: DataTypes.ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer'),
        allowNull: false,
        defaultValue: 'cash'
    },
    subtotal_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    vatable_sales: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    vat_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    vat_exempt_sales: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    zero_rated_sales: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    discount_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    discount_label_snapshot: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    discount_rate_snapshot: {
        type: DataTypes.DECIMAL(7, 4),
        allowNull: true
    },
    service_fee_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    service_fee_label_snapshot: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    service_fee_method_snapshot: {
        type: DataTypes.ENUM('dine_in', 'takeout', 'delivery', 'online'),
        allowNull: true
    },
    service_fee_overridden: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    total_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('completed', 'voided'),
        allowNull: false,
        defaultValue: 'completed'
    },
    voided_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    voided_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'pos_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['invoice_number'] },
        { fields: ['idempotency_key'] },
        { fields: ['cashier_id'] },
        { fields: ['shift_id'] },
        { fields: ['created_at'] },
        { fields: ['status'] }
    ]
});

export default PosTransaction;
