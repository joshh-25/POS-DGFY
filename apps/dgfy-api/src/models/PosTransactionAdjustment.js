import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosTransactionAdjustment = sequelize.define('PosTransactionAdjustment', {
    pos_transaction_adjustment_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    adjustment_reference: {
        type: DataTypes.STRING(40),
        allowNull: false,
        unique: true
    },
    pos_transaction_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    pos_payment_allocation_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    original_cashier_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    original_shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    original_terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    original_location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    actor_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    actor_shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    actor_terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    actor_location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    adjustment_type: {
        type: DataTypes.ENUM(
            'void',
            'cash_refund',
            'external_refund',
            'provider_refund',
            'employee_credit_reversal'
        ),
        allowNull: false
    },
    tender_type: {
        type: DataTypes.STRING(40),
        allowNull: false
    },
    amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'PHP'
    },
    status: {
        type: DataTypes.ENUM('pending', 'succeeded', 'failed', 'cancelled', 'manual_review_required'),
        allowNull: false,
        defaultValue: 'pending'
    },
    reason: {
        type: DataTypes.STRING(255),
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
    approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    approved_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    external_reference: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    provider: {
        type: DataTypes.STRING(40),
        allowNull: true
    },
    provider_reference: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    provider_event_id: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    cash_drawer_event_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    failure_code: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    failure_reason: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    retry_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    last_retry_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    failed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    }
}, {
    tableName: 'pos_transaction_adjustments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['pos_transaction_id', 'idempotency_key'], unique: true, name: 'uq_pos_transaction_adjustments_transaction_idempotency' },
        { fields: ['provider_event_id'], unique: true, name: 'uq_pos_transaction_adjustments_provider_event_id' },
        { fields: ['pos_transaction_id', 'created_at'], name: 'idx_pos_transaction_adjustments_transaction_created' },
        { fields: ['pos_payment_allocation_id', 'created_at'], name: 'idx_pos_transaction_adjustments_allocation_created' },
        { fields: ['original_shift_id', 'created_at'], name: 'idx_pos_transaction_adjustments_original_shift_created' },
        { fields: ['actor_user_id', 'created_at'], name: 'idx_pos_transaction_adjustments_actor_created' },
        { fields: ['status', 'created_at'], name: 'idx_pos_transaction_adjustments_status_created' },
        { fields: ['cash_drawer_event_id'], name: 'idx_pos_transaction_adjustments_cash_drawer_event' }
    ]
});

export default PosTransactionAdjustment;
