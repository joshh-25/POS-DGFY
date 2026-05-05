import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbModifierOption = sequelize.define('FnbModifierOption', {
  modifier_option_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  modifier_group_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  price_delta: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },
  sku_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  allergen_notes: {
    type: DataTypes.JSON,
    allowNull: true
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'fnb_modifier_options',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['modifier_group_id'] },
    { fields: ['sku_item_id'] },
    { fields: ['is_active'] }
  ]
});

export default FnbModifierOption;
