import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbItemModifierGroup = sequelize.define('FnbItemModifierGroup', {
  item_modifier_group_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  modifier_group_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  is_required_override: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  is_excluded: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'fnb_item_modifier_groups',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['item_id'] },
    { fields: ['modifier_group_id'] },
    { fields: ['item_id', 'modifier_group_id'], unique: true, name: 'uq_fnb_item_modifier_groups_item_group' }
  ]
});

export default FnbItemModifierGroup;
