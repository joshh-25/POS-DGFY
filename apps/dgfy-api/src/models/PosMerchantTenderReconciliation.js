import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosMerchantTenderReconciliation = sequelize.define('PosMerchantTenderReconciliation', {
    pos_merchant_tender_reconciliation_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    reconciliation_reference: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    shift_id: { type: DataTypes.INTEGER, allowNull: false },
    location_id: { type: DataTypes.INTEGER, allowNull: true },
    terminal_id: { type: DataTypes.STRING(100), allowNull: false },
    idempotency_key: { type: DataTypes.STRING(120), allowNull: false },
    request_hash: { type: DataTypes.STRING(64), allowNull: false },
    status: {
        type: DataTypes.ENUM('balanced', 'variance_reviewed'),
        allowNull: false
    },
    expected_breakdown: { type: DataTypes.JSON, allowNull: false },
    observed_breakdown: { type: DataTypes.JSON, allowNull: false },
    variance_breakdown: { type: DataTypes.JSON, allowNull: false },
    expected_total: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    observed_total: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    variance_total: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    review_note: { type: DataTypes.STRING(500), allowNull: true },
    reviewed_by: { type: DataTypes.INTEGER, allowNull: false },
    reviewed_at: { type: DataTypes.DATE, allowNull: false },
    supersedes_reconciliation_id: { type: DataTypes.INTEGER, allowNull: true }
}, {
    tableName: 'pos_merchant_tender_reconciliations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['shift_id', 'reviewed_at'] },
        { fields: ['shift_id', 'idempotency_key'], unique: true, name: 'uq_pos_merchant_tender_reconciliations_shift_idempotency' },
        { fields: ['location_id', 'reviewed_at'] },
        { fields: ['status', 'reviewed_at'] }
    ]
});

export default PosMerchantTenderReconciliation;
