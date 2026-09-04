import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosPaymentAllocation = sequelize.define('PosPaymentAllocation', {
    pos_payment_allocation_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    allocation_reference: {
        type: DataTypes.STRING(40),
        allowNull: false,
        unique: true
    },
    session_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    idempotency_key: {
        type: DataTypes.STRING(120),
        allowNull: false
    },
    request_hash: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'successful', 'failed', 'cancelled', 'reversed'),
        allowNull: false,
        defaultValue: 'pending'
    },
    payment_method: {
        // 'cheque' added by ADR 0077 (scoped supersession of ADR 0063 clause 4) -- Phase 202
        // (#1085). SPLIT_PAYMENT_METHODS (posValidator.js) is this column's request-side gate.
        type: DataTypes.ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'cheque'),
        allowNull: false
    },
    payment_handoff_mode: {
        type: DataTypes.ENUM('external', 'internal'),
        allowNull: true
    },
    applied_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    cash_tendered: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true
    },
    change_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true
    },
    payment_reference: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    payment_provider: {
        type: DataTypes.STRING(40),
        allowNull: true
    },
    provider_event_id: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    provider_refund_ids: {
        type: DataTypes.JSON,
        allowNull: true
    },
    provider_refund_event_id: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    provider_refund_status: {
        type: DataTypes.STRING(40),
        allowNull: true
    },
    provider_refunded_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    reversed_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    reversal_status: {
        type: DataTypes.ENUM('none', 'pending', 'partial', 'completed', 'manual_review_required'),
        allowNull: false,
        defaultValue: 'none'
    },
    failure_code: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    failure_reason: {
        type: DataTypes.STRING(255),
        allowNull: true
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
    confirmed_at: {
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
    },
    reversed_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    reversed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    reversal_reason: {
        type: DataTypes.STRING(255),
        allowNull: true
    }
}, {
    tableName: 'pos_payment_allocations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['session_id', 'status'] },
        { fields: ['session_id', 'created_at'] },
        { fields: ['shift_id', 'status'] },
        { fields: ['location_id', 'status'] },
        { fields: ['payment_method', 'status'] },
        { fields: ['session_id', 'reversal_status'] },
        { fields: ['provider_event_id'], unique: true, name: 'uq_pos_payment_allocations_provider_event_id' },
        { fields: ['provider_refund_event_id'], unique: true, name: 'uq_pos_payment_allocations_provider_refund_event_id' },
        { fields: ['session_id', 'idempotency_key'], unique: true },
        { fields: ['created_at'] }
    ]
});

export default PosPaymentAllocation;
