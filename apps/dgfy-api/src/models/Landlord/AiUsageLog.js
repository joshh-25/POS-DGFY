
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class AiUsageLog extends Model { }

    AiUsageLog.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // Which product surface generated this row (e.g. 'ai_assistant',
        // 'menu_import', 'item_image_generation') — lets spend be attributed
        // and budgeted per-feature instead of pooling across all AI usage
        // (see #195 and migration 20260803000001).
        feature: {
            type: DataTypes.STRING(64),
            allowNull: false,
            defaultValue: 'ai_assistant'
        },
        model: {
            type: DataTypes.STRING,
            allowNull: false
        },
        input_tokens: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        output_tokens: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        // Non-token usage count for unit-priced features (e.g. images
        // generated) — see config/aiModelRates.js's resolveImageModelRate().
        // Token-priced rows leave this at 0.
        units: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        cost_usd: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: 0
        },
        timestamp: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'AiUsageLog',
        tableName: 'ai_usage_logs',
        underscored: true,
        timestamps: true,
        updatedAt: false // Immutable log
    });

    return AiUsageLog;
};
