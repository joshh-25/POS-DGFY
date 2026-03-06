
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class Tenant extends Model { }

    Tenant.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        domain: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: true
        },
        subdomain: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: true
        },
        db_name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        company_token: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        db_host: {
            type: DataTypes.STRING,
            defaultValue: 'localhost'
        },
        status: {
            type: DataTypes.ENUM('pending', 'active', 'inactive', 'rejected', 'archived'),
            defaultValue: 'pending'
        },
        // Store admin details for deferred provisioning (before approval)
        admin_email: {
            type: DataTypes.STRING,
            allowNull: true
        },
        admin_password_hash: {
            type: DataTypes.STRING,
            allowNull: true
        },
        settings: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        // Subscription & Payment Fields
        plan: {
            type: DataTypes.ENUM('standard', 'premium'),
            defaultValue: 'standard'
        },
        billing_cycle_anchor: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: 1,
                max: 31
            }
        },
        subscription_status: {
            type: DataTypes.ENUM('active', 'inactive', 'past_due', 'cancelled', 'pending'),
            defaultValue: 'inactive'
        },
        paypal_subscription_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        current_period_end: {
            type: DataTypes.DATE,
            allowNull: true
        },
        trial_ends_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        grace_period_end: {
            type: DataTypes.DATE,
            allowNull: true
        },
        cancelled_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        last_expiry_notified_at: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'last_expiry_notified_at'
        },
        last_expiry_notification_type: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'last_expiry_notification_type'
        }
    }, {
        sequelize,
        modelName: 'Tenant',
        tableName: 'tenants',
        underscored: true,
        timestamps: true
    });

    return Tenant;
};
