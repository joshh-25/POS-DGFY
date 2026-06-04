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
        last_login_at: {
            type: DataTypes.DATE,
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
            { fields: ['username'], name: 'idx_dgfy_accounts_username' }
        ]
    });

    return DgfyAccount;
};
