import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemAllergen = sequelize.define('ItemAllergen', {
  allergen_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  allergen_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  is_cross_contamination: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'item_allergens',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      unique: true,
      fields: ['item_id', 'allergen_name']
    }
  ]
});

export default ItemAllergen;

