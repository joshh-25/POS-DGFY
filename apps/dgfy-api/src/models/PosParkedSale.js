import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosParkedSale = sequelize.define('PosParkedSale', {
    pos_parked_sale_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    park_reference: {
        type: DataTypes.STRING(40),
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
    status: {
        type: DataTypes.ENUM('parked', 'claimed', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'parked'
    },
    revision: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 1
    },
    cashier_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    shift_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    origin_cashier_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    origin_shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    location_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    snapshot: {
        type: DataTypes.JSON,
        allowNull: false
    },
    line_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    quantity_total: {
        type: DataTypes.DECIMAL(24, 12),
        allowNull: false,
        defaultValue: 0
    },
    subtotal_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    total_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    claimed_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    claimed_terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    claimed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    completed_transaction_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    cancelled_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    cancel_reason: {
        type: DataTypes.STRING(255),
        allowNull: true
    }
}, {
    tableName: 'pos_parked_sales',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['status'] },
        { fields: ['shift_id', 'status'] },
        { fields: ['cashier_id', 'status'] },
        { fields: ['location_id', 'status'] },
        { fields: ['origin_cashier_id', 'status'] },
        { fields: ['origin_shift_id', 'status'] },
        { fields: ['created_at'] },
        { fields: ['claimed_by', 'status'] }
    ]
});

export default PosParkedSale;
