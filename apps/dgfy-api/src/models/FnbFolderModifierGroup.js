import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbFolderModifierGroup = sequelize.define('FnbFolderModifierGroup', {
  folder_modifier_group_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  folder_id: {
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
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'fnb_folder_modifier_groups',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['folder_id'] },
    { fields: ['modifier_group_id'] },
    { fields: ['folder_id', 'modifier_group_id'], unique: true, name: 'uq_fnb_folder_modifier_groups_folder_group' }
  ]
});

export default FnbFolderModifierGroup;
