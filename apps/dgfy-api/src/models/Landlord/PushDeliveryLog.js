import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class PushDeliveryLog extends Model {}

    PushDeliveryLog.init({
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        dedupe_key: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        token_id: { type: DataTypes.UUID, allowNull: false },
        token_hash: { type: DataTypes.STRING(64), allowNull: false },
        purpose: { type: DataTypes.STRING(50), allowNull: false },
        status: { type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'failed', 'unconfigured'), allowNull: false },
        simulated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        ticket_id: { type: DataTypes.STRING(128), allowNull: true },
        receipt_status: { type: DataTypes.STRING(80), allowNull: true },
        receipt_checked_at: { type: DataTypes.DATE, allowNull: true },
        error_code: { type: DataTypes.STRING(80), allowNull: true },
        tenant_id: { type: DataTypes.UUID, allowNull: true },
        reference: { type: DataTypes.STRING(32), allowNull: true },
        sent_at: { type: DataTypes.DATE, allowNull: false }
    }, {
        sequelize,
        modelName: 'PushDeliveryLog',
        tableName: 'push_delivery_logs',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['status', 'sent_at'], name: 'idx_push_delivery_logs_status_sent_at' },
            { fields: ['token_id', 'sent_at'], name: 'idx_push_delivery_logs_token_sent_at' },
            { fields: ['tenant_id', 'reference', 'sent_at'], name: 'idx_push_delivery_logs_order_sent_at' },
            { fields: ['receipt_checked_at', 'sent_at'], name: 'idx_push_delivery_logs_receipt_poll' }
        ]
    });

    return PushDeliveryLog;
};
