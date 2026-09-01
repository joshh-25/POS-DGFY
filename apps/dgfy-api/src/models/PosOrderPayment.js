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
        // 'cheque' added by ADR 0077 (scoped supersession of ADR 0063 clause 4) -- Phase 202
        // (#1085). Settle Balance is this column's own writer (posUseCases.js
        // BALANCE_SETTLEMENT_METHODS).
        type: DataTypes.ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph', 'employee_credit', 'grab_pay', 'shopeepay', 'cheque'),
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
    },
    // Phase 204 (#965): an optional, attach-once proof-of-payment image for a merchant-owned
    // 'balance' settlement. Never serialize `proof_file_path` to a client -- it is a storage key,
    // not a URL (posPaymentProofStorage.js); `has_payment_proof` is the derived boolean clients
    // see instead. ADR 0063 Amendments (2026-08-31): an audit aid only, never independent
    // verification -- clause 5 [binding] is unweakened.
    proof_file_path: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    proof_mime_type: {
        type: DataTypes.STRING(60),
        allowNull: true
    },
    proof_file_size_bytes: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    proof_sha256: {
        type: DataTypes.CHAR(64),
        allowNull: true
    },
    proof_attached_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    proof_attached_by: {
        // Staff attribution for the attach action. FK -> users(user_id) ON DELETE SET NULL,
        // matching `recorded_by` above.
        type: DataTypes.INTEGER,
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
