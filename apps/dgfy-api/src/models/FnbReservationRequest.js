import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbReservationRequest = sequelize.define('FnbReservationRequest', {
  reservation_request_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  public_reference: {
    type: DataTypes.STRING(40),
    allowNull: false,
    unique: true
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
  party_size: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2
  },
  requested_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 90
  },
  buffer_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 15
  },
  table_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('requested', 'confirmed', 'waitlisted', 'seated', 'cancelled', 'no_show'),
    allowNull: false,
    defaultValue: 'requested'
  },
  source: {
    type: DataTypes.ENUM('storefront', 'pos', 'admin'),
    allowNull: false,
    defaultValue: 'admin'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'fnb_reservation_requests',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['public_reference'], unique: true },
    { fields: ['requested_at'] },
    { fields: ['status'] },
    { fields: ['table_id'] }
  ]
});

export default FnbReservationRequest;
