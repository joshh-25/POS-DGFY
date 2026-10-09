import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantIntakeProposal extends Model { }
    TenantIntakeProposal.init({
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        target: { type: DataTypes.ENUM('OFFICIAL', 'DEMO'), allowNull: false },
        status: { type: DataTypes.ENUM('pending', 'approved', 'executing', 'executed', 'rejected', 'expired', 'failed'), allowNull: false, defaultValue: 'pending' },
        source: { type: DataTypes.ENUM('mcp', 'admin_upload', 'admin_form'), allowNull: false },
        requested_by_admin_id: { type: DataTypes.UUID, allowNull: false },
        payload_json: { type: DataTypes.JSON, allowNull: false },
        payload_hash: { type: DataTypes.STRING(64), allowNull: false },
        provenance: { type: DataTypes.JSON, allowNull: true },
        warnings: { type: DataTypes.JSON, allowNull: false },
        expires_at: { type: DataTypes.DATE, allowNull: false },
        approved_by_admin_id: { type: DataTypes.UUID, allowNull: true },
        approved_at: { type: DataTypes.DATE, allowNull: true },
        approved_via: { type: DataTypes.STRING(40), allowNull: true },
        tenant_id: { type: DataTypes.UUID, allowNull: true },
        failure_detail: { type: DataTypes.JSON, allowNull: true }
    }, {
        sequelize, modelName: 'TenantIntakeProposal', tableName: 'tenant_intake_proposals', underscored: true,
        timestamps: true, indexes: [{ fields: ['status', 'created_at'], name: 'idx_tenant_intake_status_time' }]
    });
    return TenantIntakeProposal;
};
