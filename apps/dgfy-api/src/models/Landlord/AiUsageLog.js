
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
