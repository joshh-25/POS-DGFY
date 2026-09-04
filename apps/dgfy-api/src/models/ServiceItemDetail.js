import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceItemDetail = sequelize.define('ServiceItemDetail', {
  service_detail_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  service_category: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60
  },
  buffer_before_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  buffer_after_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  lead_time_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  cancellation_window_hours: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 24
  },
  bookable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  visible_in_storefront: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  visible_in_pos: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  addons_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  payment_policy: {
    type: DataTypes.ENUM('customer_choice', 'prepaid_required', 'postpaid_only', 'deposit_allowed'),
    allowNull: false,
    defaultValue: 'customer_choice'
  },
  service_area_type: {
    // 'item_handoff' added by Phase 88 of #482 (ADR 0064 decision 7): the business collects and
    // returns the item, rather than working in_store/at customer_location/online/hybrid. Keeps
    // ADR 0057 clause 4's grain intact - still a per-item field, not a per-store setting.
    type: DataTypes.ENUM('in_store', 'customer_location', 'online', 'hybrid', 'item_handoff'),
    allowNull: false,
    defaultValue: 'in_store'
  },
  intake_form_schema: {
    type: DataTypes.JSON,
    allowNull: true
  },
  client_notes_template: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'service_item_details',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['item_id'], unique: true },
    { fields: ['service_category'] },
    { fields: ['bookable'] },
    { fields: ['visible_in_storefront'] },
    { fields: ['visible_in_pos'] }
  ]
});

export default ServiceItemDetail;
