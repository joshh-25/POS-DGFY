import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class UserTenantMapping extends Model { }

    UserTenantMapping.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            set(value) {
                // Always store emails in lowercase for consistent lookups
                this.setDataValue('email', value.toLowerCase().trim());
            },
            get() {
                const rawValue = this.getDataValue('email');
                return rawValue ? rawValue.toLowerCase() : null;
            }
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'tenants',
                key: 'id'
            }
        }
    }, {
        sequelize,
        modelName: 'UserTenantMapping',
        tableName: 'user_tenant_mappings',
        underscored: true,
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['email', 'tenant_id'],
                name: 'unique_email_tenant'
            },
            {
                fields: ['email'],
                name: 'idx_email'
            },
            {
                fields: ['tenant_id'],
                name: 'idx_tenant'
            }
        ]
    });

    return UserTenantMapping;
};
