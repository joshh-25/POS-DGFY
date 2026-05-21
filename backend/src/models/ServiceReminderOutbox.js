import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceReminderOutbox = sequelize.define('ServiceReminderOutbox', {
  reminder_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  booking_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  channel: {
    type: DataTypes.ENUM('email', 'sms'),
    allowNull: false,
    defaultValue: 'email'
  },
  reminder_type: {
    type: DataTypes.ENUM('confirmation', 'appointment_reminder', 'waitlist_alert', 'follow_up'),
    allowNull: false,
    defaultValue: 'appointment_reminder'
  },
  recipient: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  scheduled_for: {
    type: DataTypes.DATE,
    allowNull: false
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'failed', 'skipped'),
    allowNull: false,
    defaultValue: 'pending'
  },
  provider_message_id: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  failure_reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  payload: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'service_reminder_outbox',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['booking_id'] },
    { fields: ['channel'] },
    { fields: ['reminder_type'] },
    { fields: ['scheduled_for'] },
    { fields: ['status'] },
    { fields: ['booking_id', 'channel', 'reminder_type'], unique: true, name: 'uq_service_reminder_booking_channel_type' }
  ]
});

export default ServiceReminderOutbox;
