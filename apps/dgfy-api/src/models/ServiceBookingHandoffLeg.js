import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Phase 88 of #482, authorized by ADR 0064 decision 2. Keyed off booking_id, mirroring
// ServiceBookingLine, rather than pos_transaction_id like DeliveryJob - DeliveryJob is one-way and
// 1:1 with a transaction and cannot serve here. One row per direction per booking (see the unique
// index below); the (inbound method, outbound method) pair is what the booking's fulfillment
// variant is derived from at the API layer (ADR 0064 decision 3) - never a stored profile key.
const ServiceBookingHandoffLeg = sequelize.define('ServiceBookingHandoffLeg', {
  handoff_leg_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  booking_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  direction: {
    type: DataTypes.ENUM('inbound', 'outbound'),
    allowNull: false
  },
  method: {
    type: DataTypes.ENUM('business_pickup', 'business_delivery', 'customer_dropoff', 'customer_collection'),
    allowNull: false
  },
  address_line: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true
  },
  customer_address_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  scheduled_from: {
    type: DataTypes.DATE,
    allowNull: true
  },
  scheduled_to: {
    type: DataTypes.DATE,
    allowNull: true
  },
  contact_name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  contact_phone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  instructions: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'scheduled', 'in_transit', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending'
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'service_booking_handoff_legs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['booking_id', 'direction'], unique: true },
    { fields: ['customer_address_id'] },
    { fields: ['location_id'] },
    { fields: ['status'] },
    { fields: ['scheduled_from'] }
  ]
});

export default ServiceBookingHandoffLeg;
