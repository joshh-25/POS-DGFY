import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class EngagementEvent extends Model { }

    EngagementEvent.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        event_type: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        event_category: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        event_version: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'tenants',
                key: 'id'
            }
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        source: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'backend'
        },
        subscription_id: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        correlation_id: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        request_id: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        trace_id: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        idempotency_key: {
            type: DataTypes.STRING(255),
            allowNull: true,
            unique: true
        },
        outcome: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        failure_code: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        failure_reason: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        provider_event_id: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        provider_event_time: {
            type: DataTypes.DATE,
            allowNull: true
        },
        ingested_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        processed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        environment: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        surface: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        platform: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        actor_type: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        is_internal_actor: {
            type: DataTypes.BOOLEAN,
            allowNull: true
        },
        is_bot_suspected: {
            type: DataTypes.BOOLEAN,
            allowNull: true
        },
        session_id: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        experiment_key: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        variant_key: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        exposure_id: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        },
        event_time: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'EngagementEvent',
        tableName: 'engagement_events',
        underscored: true,
        timestamps: true,
        updatedAt: false
    });

    return EngagementEvent;
};
