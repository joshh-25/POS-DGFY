import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbItemKitchenRoute = sequelize.define('FnbItemKitchenRoute', {
  item_kitchen_route_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  kitchen_station_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  default_course: {
    type: DataTypes.ENUM('appetizer', 'main', 'dessert', 'drink', 'other'),
    allowNull: false,
    defaultValue: 'main'
  },
  is_primary: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'fnb_item_kitchen_routes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['item_id'] },
    { fields: ['kitchen_station_id'] }
  ]
});

export default FnbItemKitchenRoute;
