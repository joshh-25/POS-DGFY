import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyAccountTenantMembership extends Model { }

    DgfyAccountTenantMembership.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'dgfy_accounts',
                key: 'id'
            }
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'tenants',
                key: 'id'
            }
        },
        tenant_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        role: {
            type: DataTypes.STRING(40),
            allowNull: false,
            defaultValue: 'staff'
        },
        status: {
            type: DataTypes.ENUM('pending', 'accepted', 'declined', 'removed'),
            allowNull: false,
            defaultValue: 'pending'
        },
        source: {
            type: DataTypes.ENUM('founder', 'invite', 'admin_handover'),
            allowNull: false,
            defaultValue: 'invite'
        },
        accepted_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        last_selected_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAccountTenantMembership',
        tableName: 'dgfy_account_tenant_memberships',
        underscored: true,
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['dgfy_account_id', 'tenant_id'],
                name: 'unique_dgfy_account_tenant'
            },
            { fields: ['tenant_id'], name: 'idx_dgfy_memberships_tenant' },
            { fields: ['status'], name: 'idx_dgfy_memberships_status' }
        ]
    });

    return DgfyAccountTenantMembership;
};
