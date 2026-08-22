import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Per-order downpayment/balance/refund/forfeiture ledger. One row per payment event.
// ADR 0069 clause 4 (carried over verbatim from ADR 0068 clause 4, unchanged by the supersession)
// authorizes this table, structurally modeled on PosPaymentAllocation.js rather than
// platform_invoice_payments (clause 4b). Amounts stay peso DECIMAL(14,4), matching the same
// structural reference -- see the Phase 137 (#819) plan for why centavos were deliberately not
// used despite clause 4b permitting them.
const PosOrderPayment = sequelize.define('PosOrderPayment', {
    pos_order_payment_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    pos_transaction_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    kind: {
        type: DataTypes.ENUM('downpayment', 'balance', 'refund', 'forfeiture'),
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'successful', 'failed', 'cancelled', 'reversed'),
        allowNull: false,
        defaultValue: 'pending'
    },
    amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    payment_method: {
        type: DataTypes.ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph', 'employee_credit', 'grab_pay', 'shopeepay'),
        allowNull: false
    },
    idempotency_key: {
        type: DataTypes.STRING(120),
        allowNull: false
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
    related_pos_order_payment_id: {
        // Links a 'refund'/'forfeiture' event row back to the original 'downpayment'/'balance'
        // row it resolves -- ADR 0069 clause 8's forfeited-vs-applied distinction is represented
        // as a separate ledger row, not a status flag on the original.
        type: DataTypes.INTEGER,
        allowNull: true
    },
    recorded_by: {
        // Staff attribution for a manually-recorded 'balance' event (ADR 0069 clause 2).
        // Null for online-captured 'downpayment' rows.
        type: DataTypes.INTEGER,
        allowNull: true
    },
    confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'pos_order_payments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['pos_transaction_id', 'idempotency_key'], unique: true },
        { fields: ['provider_event_id'], unique: true, name: 'uq_pos_order_payments_provider_event_id' },
        { fields: ['pos_transaction_id', 'status'] },
        { fields: ['pos_transaction_id', 'kind'] },
        { fields: ['created_at'] }
    ]
});

export default PosOrderPayment;
