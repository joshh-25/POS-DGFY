import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceBooking = sequelize.define('ServiceBooking', {
  booking_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  public_reference: {
    type: DataTypes.STRING(40),
    allowNull: false,
    unique: true
  },
  service_item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  service_detail_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  store_customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  customer_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  customer_email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  customer_phone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  provider_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  resource_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  start_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  end_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('requested', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show'),
    allowNull: false,
    defaultValue: 'requested'
  },
  payment_timing: {
    type: DataTypes.ENUM('prepaid', 'postpaid', 'deposit'),
    allowNull: false,
    defaultValue: 'postpaid'
  },
  payment_status: {
    type: DataTypes.ENUM('unpaid', 'payment_pending', 'paid', 'deposit_paid', 'failed', 'refunded'),
    allowNull: false,
    defaultValue: 'unpaid'
  },
  payment_reference: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  payment_checkout_url: {
    type: DataTypes.STRING(1000),
    allowNull: true
  },
  pos_transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  source: {
    type: DataTypes.ENUM('storefront', 'pos', 'admin'),
    allowNull: false,
    defaultValue: 'storefront'
  },
  idempotency_key: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  request_hash: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  claim_token_hash: {
    type: DataTypes.STRING(128),
    allowNull: true
  },
  claim_token_expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  intake_responses: {
    type: DataTypes.JSON,
    allowNull: true
  },
  cancellation_reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  }
}, {
  tableName: 'service_bookings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['public_reference'], unique: true },
    { fields: ['service_item_id'] },
    { fields: ['store_customer_id'] },
    { fields: ['provider_user_id'] },
    { fields: ['resource_id'] },
    { fields: ['location_id'] },
    { fields: ['status'] },
    { fields: ['start_at'] },
    { fields: ['payment_status'] },
    { fields: ['idempotency_key'] },
    { fields: ['pos_transaction_id'] }
  ]
});

export default ServiceBooking;
