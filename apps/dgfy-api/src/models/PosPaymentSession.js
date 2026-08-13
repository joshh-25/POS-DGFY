import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosPaymentSession = sequelize.define('PosPaymentSession', {
    pos_payment_session_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    session_reference: {
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
        type: DataTypes.ENUM('open', 'partially_paid', 'ready_to_complete', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'open'
    },
    cashier_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    shift_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    location_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    parked_sale_id: {
        type: DataTypes.INTEGER,
        allowNull: true
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
    paid_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    remaining_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
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
    tableName: 'pos_payment_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['status'] },
        { fields: ['shift_id', 'status'] },
        { fields: ['cashier_id', 'status'] },
        { fields: ['location_id', 'status'] },
        { fields: ['parked_sale_id'] },
        { fields: ['completed_transaction_id'] },
        { fields: ['created_at'] }
    ]
});

export default PosPaymentSession;
