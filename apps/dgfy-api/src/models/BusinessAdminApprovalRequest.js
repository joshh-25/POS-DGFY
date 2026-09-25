import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const BusinessAdminApprovalRequest = sequelize.define('BusinessAdminApprovalRequest', {
    business_admin_approval_request_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    action_type: {
        type: DataTypes.ENUM('pos_refund', 'force_close_shift', 'pos_void', 'pos_parked_sale_cancel'),
        allowNull: false
    },
    entity_type: {
        type: DataTypes.STRING(60),
        allowNull: false
    },
    entity_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    payload: {
        type: DataTypes.JSON,
        allowNull: false
    },
    payload_hash: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'executed', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
    },
    reason: {
        type: DataTypes.STRING(500),
        allowNull: false
    },
    idempotency_key: {
        type: DataTypes.STRING(120),
        allowNull: false
    },
    requested_by: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    rejected_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    approval_note: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    approved_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    rejected_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    executed_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'business_admin_approval_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { name: 'uq_business_admin_approval_action_idempotency', unique: true, fields: ['action_type', 'idempotency_key'] },
        { name: 'idx_business_admin_approval_status_created', fields: ['status', 'created_at'] },
        { name: 'idx_business_admin_approval_entity_created', fields: ['entity_type', 'entity_id', 'created_at'] },
        { name: 'idx_business_admin_approval_requested_created', fields: ['requested_by', 'created_at'] }
    ]
});

export default BusinessAdminApprovalRequest;
