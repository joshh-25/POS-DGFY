import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemShelfLife = sequelize.define('ItemShelfLife', {
  shelf_life_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  duration_days: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  opened_shelf_life_days: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  storage_temperature: {
    type: DataTypes.ENUM('frozen', 'refrigerated', 'cool', 'room', 'ambient'),
    allowNull: true
  },
  storage_conditions: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'item_shelf_life',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ItemShelfLife;
