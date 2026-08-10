import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyAccount extends Model { }

    DgfyAccount.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        first_name: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        middle_name: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        last_name: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        username: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
            set(value) {
                this.setDataValue('email', String(value || '').trim().toLowerCase());
            }
        },
        phone: {
            type: DataTypes.STRING(40),
            allowNull: false,
            unique: true
        },
        password_hash: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        email_verified_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        phone_verified_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        business_step_up_verified_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        last_login_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        provisioning_status: {
            type: DataTypes.ENUM('self_registered', 'admin_provisioned'),
            allowNull: false,
            defaultValue: 'self_registered'
        },
        temporary_password_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        email_verification_source: {
            type: DataTypes.ENUM('public_otp', 'platform_admin_provisioned'),
            allowNull: true
        },
        merchant_terms_acknowledged_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        deleted_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        deleted_by: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        deletion_reason: {
            type: DataTypes.STRING(500),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAccount',
        tableName: 'dgfy_accounts',
        underscored: true,
        timestamps: true,
        indexes: [
            { unique: true, fields: ['email'], name: 'unique_dgfy_accounts_email' },
            { unique: true, fields: ['phone'], name: 'unique_dgfy_accounts_phone' },
            { fields: ['username'], name: 'idx_dgfy_accounts_username' },
            { fields: ['provisioning_status'], name: 'idx_dgfy_accounts_provisioning_status' },
            { fields: ['deleted_at'], name: 'idx_dgfy_accounts_deleted_at' }
        ]
    });

    return DgfyAccount;
};
