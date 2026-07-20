import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceWaitlistEntry = sequelize.define('ServiceWaitlistEntry', {
  waitlist_entry_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  service_item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
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
  preferred_start_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  preferred_end_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('waiting', 'notified', 'booked', 'expired', 'cancelled'),
    allowNull: false,
    defaultValue: 'waiting'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'service_waitlist_entries',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['service_item_id'] },
    { fields: ['store_customer_id'] },
    { fields: ['status'] },
    { fields: ['preferred_start_at'] }
  ]
});

export default ServiceWaitlistEntry;
