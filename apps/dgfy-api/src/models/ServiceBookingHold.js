import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceBookingHold = sequelize.define('ServiceBookingHold', {
  hold_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  hold_token: {
    type: DataTypes.STRING(80),
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
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'consumed', 'expired', 'cancelled'),
    allowNull: false,
    defaultValue: 'active'
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
  }
}, {
  tableName: 'service_booking_holds',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['hold_token'], unique: true },
    { fields: ['service_item_id'] },
    { fields: ['store_customer_id'] },
    { fields: ['provider_user_id'] },
    { fields: ['resource_id'] },
    { fields: ['location_id'] },
    { fields: ['status'] },
    { fields: ['expires_at'] },
    { fields: ['idempotency_key'] }
  ]
});

export default ServiceBookingHold;
