import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DispatchOrder = sequelize.define('DispatchOrder', {
    do_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    do_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    recipient_name: {
        type: DataTypes.STRING(200),
        allowNull: false
    },
    recipient_type: {
        type: DataTypes.ENUM('external', 'internal'),
        allowNull: false,
        defaultValue: 'external'
    },
    reference_jo: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    reference_po: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    dispatch_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('draft', 'confirmed', 'partial', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    confirmed_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    archived_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    archived_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'dispatch_orders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['status'] },
        { fields: ['dispatch_date'] },
        { fields: ['recipient_name'] },
        { fields: ['do_number'] }
    ]
});

export default DispatchOrder;
