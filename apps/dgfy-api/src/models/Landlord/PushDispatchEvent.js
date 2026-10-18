import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class PushDispatchEvent extends Model {}

    PushDispatchEvent.init({
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        purpose: { type: DataTypes.STRING(50), allowNull: false },
        outcome: { type: DataTypes.STRING(20), allowNull: false },
        reason_code: { type: DataTypes.STRING(80), allowNull: false },
        tenant_id: { type: DataTypes.UUID, allowNull: true },
        reference: { type: DataTypes.STRING(32), allowNull: true },
        eligible_token_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }
    }, {
        sequelize,
        modelName: 'PushDispatchEvent',
        tableName: 'push_dispatch_events',
        underscored: true,
        timestamps: true,
        updatedAt: false,
        indexes: [
            { fields: ['created_at'], name: 'idx_push_dispatch_events_created_at' },
            { fields: ['purpose', 'outcome', 'created_at'], name: 'idx_push_dispatch_events_purpose_outcome' }
        ]
    });

    return PushDispatchEvent;
};
