import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DeliveryRun = sequelize.define('DeliveryRun', {
  delivery_run_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  label: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  scheduled_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  scheduled_date_end: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('draft', 'scheduled', 'dispatched', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'draft'
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'delivery_runs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['status', 'scheduled_date', 'scheduled_date_end'] },
    { fields: ['location_id', 'status'] }
  ]
});

export default DeliveryRun;
