import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantCompliancePeripheral extends Model { }

    TenantCompliancePeripheral.init({
        tenant_compliance_peripheral_id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'tenants',
                key: 'id'
            }
        },
        terminal_id: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        is_shared: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        device_class: {
            type: DataTypes.ENUM('receipt_printer', 'cash_drawer', 'scanner', 'payment_terminal', 'other'),
            allowNull: false
        },
        brand: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        model: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        serial_number: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        accreditation_reference: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        accreditation_valid_from: {
            type: DataTypes.DATE,
            allowNull: true
        },
        accreditation_valid_until: {
            type: DataTypes.DATE,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'accredited', 'expired', 'revoked'),
            allowNull: false,
            defaultValue: 'pending'
        },
        verification_status: {
            type: DataTypes.ENUM('pending_review', 'verified', 'rejected', 'revoked'),
            allowNull: false,
            defaultValue: 'pending_review'
        },
        verified_by_actor_type: {
            type: DataTypes.ENUM('tenant_master_admin', 'platform_admin'),
            allowNull: true
        },
        verified_by_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        verified_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        verification_note: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        verification_evidence_ref: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: {}
        }
    }, {
        sequelize,
        modelName: 'TenantCompliancePeripheral',
        tableName: 'tenant_compliance_peripherals',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['tenant_id'] },
            { fields: ['terminal_id'] },
            { fields: ['is_shared'] },
            { fields: ['device_class'] },
            { fields: ['status'] },
            { fields: ['verification_status'] },
            { fields: ['accreditation_valid_until'] },
            { unique: true, fields: ['tenant_id', 'serial_number'] }
        ]
    });

    return TenantCompliancePeripheral;
};
