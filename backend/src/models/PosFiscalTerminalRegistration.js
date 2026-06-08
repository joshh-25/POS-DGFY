import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosFiscalTerminalRegistration = sequelize.define('PosFiscalTerminalRegistration', {
    pos_fiscal_terminal_registration_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    min_number: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    machine_serial_number: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    software_version: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    software_serial_number: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    ptu_number: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    permit_issued_at: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    permit_effective_at: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    permit_expires_at: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    receipt_printer_binding: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    cash_drawer_binding: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    accreditation_status: {
        type: DataTypes.ENUM('draft', 'pending_review', 'verified', 'revoked'),
        allowNull: false,
        defaultValue: 'draft'
    },
    evidence_ref: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    },
    registered_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    verified_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    verified_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    revoked_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'pos_fiscal_terminal_registrations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { unique: true, fields: ['terminal_id'] },
        { fields: ['location_id'] },
        { fields: ['accreditation_status'] },
        { fields: ['min_number'] }
    ]
});

export default PosFiscalTerminalRegistration;
