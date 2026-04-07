import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosTransaction = sequelize.define('PosTransaction', {
    pos_transaction_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    invoice_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    document_type: {
        type: DataTypes.ENUM('non_fiscal_slip', 'fiscal_invoice'),
        allowNull: false,
        defaultValue: 'non_fiscal_slip'
    },
    idempotency_key: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true
    },
    request_hash: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    cashier_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    order_source: {
        type: DataTypes.ENUM('in_store', 'online_store'),
        allowNull: false,
        defaultValue: 'in_store'
    },
    order_method: {
        type: DataTypes.ENUM('dine_in', 'takeout', 'pickup', 'delivery', 'online'),
        allowNull: false,
        defaultValue: 'dine_in'
    },
    fulfillment_status: {
        type: DataTypes.ENUM(
            'placed',
            'confirmed',
            'preparing',
            'ready_for_pickup',
            'out_for_delivery',
            'completed',
            'cancelled',
            'rejected'
        ),
        allowNull: true,
        defaultValue: null
    },
    location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    tracking_pin: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true
    },
    customer_name: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    customer_phone: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    customer_email: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    delivery_address: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    delivery_latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true
    },
    delivery_longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true
    },
    scheduled_for: {
        type: DataTypes.DATE,
        allowNull: true
    },
    special_instructions: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    delivery_fee: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    store_customer_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    outside_radius_flag: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    accepted_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    accepted_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    payment_type: {
        type: DataTypes.ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer'),
        allowNull: false,
        defaultValue: 'cash'
    },
    subtotal_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    vatable_sales: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    vat_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    vat_exempt_sales: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    zero_rated_sales: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    discount_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    discount_label_snapshot: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    discount_rate_snapshot: {
        type: DataTypes.DECIMAL(7, 4),
        allowNull: true
    },
    service_fee_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    service_fee_label_snapshot: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    service_fee_method_snapshot: {
        type: DataTypes.ENUM('dine_in', 'takeout', 'pickup', 'delivery', 'online'),
        allowNull: true
    },
    service_fee_overridden: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    total_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('completed', 'voided'),
        allowNull: false,
        defaultValue: 'completed'
    },
    voided_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    voided_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'pos_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['invoice_number'] },
        { fields: ['document_type'] },
        { fields: ['idempotency_key'] },
        { fields: ['tracking_pin'] },
        { fields: ['order_source'] },
        { fields: ['fulfillment_status'] },
        { fields: ['location_id'] },
        { fields: ['store_customer_id'] },
        { fields: ['cashier_id'] },
        { fields: ['shift_id'] },
        { fields: ['created_at'] },
        { fields: ['status'] }
    ]
});

export default PosTransaction;
