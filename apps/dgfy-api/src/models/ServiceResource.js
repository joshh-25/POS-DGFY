import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceResource = sequelize.define('ServiceResource', {
  resource_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  resource_type: {
    type: DataTypes.ENUM('provider', 'room', 'equipment', 'vehicle', 'station'),
    allowNull: false,
    defaultValue: 'provider'
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  capacity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  weekly_availability: {
    type: DataTypes.JSON,
    allowNull: true
  },
  blackout_dates: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'service_resources',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['resource_type'] },
    { fields: ['location_id'] },
    { fields: ['is_active'] }
  ]
});

export default ServiceResource;
