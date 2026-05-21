import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbKitchenStation = sequelize.define('FnbKitchenStation', {
  kitchen_station_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  station_type: {
    type: DataTypes.ENUM('hot_line', 'cold_line', 'bar', 'dessert', 'expo', 'prep', 'other'),
    allowNull: false,
    defaultValue: 'hot_line'
  },
  ticket_prefix: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'fnb_kitchen_stations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['is_active'] },
    { fields: ['sort_order'] }
  ]
});

export default FnbKitchenStation;
