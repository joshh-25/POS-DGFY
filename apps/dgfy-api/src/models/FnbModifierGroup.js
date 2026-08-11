import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbModifierGroup = sequelize.define('FnbModifierGroup', {
  modifier_group_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  display_name: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  min_select: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  max_select: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  required: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  visible_in_pos: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  visible_in_storefront: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  group_kind: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'modifier' },
  parent_modifier_option_id: { type: DataTypes.INTEGER, allowNull: true },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'fnb_modifier_groups',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['is_active'] },
    { fields: ['sort_order'] }
  ]
});

export default FnbModifierGroup;
