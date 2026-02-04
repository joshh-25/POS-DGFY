
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
        db_username: {
            type: DataTypes.STRING,
            allowNull: true // If null, use default app user
        },
        db_password: {
            type: DataTypes.STRING,
            allowNull: true
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
        plan: {
            type: DataTypes.STRING, // e.g., 'free', 'pro'
            defaultValue: 'free'
        },
        settings: {
            type: DataTypes.JSON,
            defaultValue: {}
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
