import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const BusinessAdminExpense = sequelize.define('BusinessAdminExpense', {
    business_admin_expense_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    expense_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    location_name_snapshot: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    category: {
        type: DataTypes.STRING(80),
        allowNull: false
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'PHP'
    },
    payment_method: {
        type: DataTypes.ENUM('cash', 'bank_transfer', 'card', 'gcash', 'maya', 'other'),
        allowNull: false,
        defaultValue: 'cash'
    },
    vendor_name: {
        type: DataTypes.STRING(160),
        allowNull: true
    },
    reference: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    notes: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('posted', 'voided'),
        allowNull: false,
        defaultValue: 'posted'
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    voided_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    voided_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    void_reason: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    idempotency_key: {
        type: DataTypes.STRING(120),
        allowNull: false
    }
}, {
    tableName: 'business_admin_expenses',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { name: 'uq_business_admin_expenses_idempotency', unique: true, fields: ['idempotency_key'] },
        { name: 'idx_business_admin_expenses_date_location_status', fields: ['expense_date', 'location_id', 'status'] },
        { name: 'idx_business_admin_expenses_category_date', fields: ['category', 'expense_date'] },
        { name: 'idx_business_admin_expenses_created_by_date', fields: ['created_by', 'created_at'] }
    ]
});

export default BusinessAdminExpense;
