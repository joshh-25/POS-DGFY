import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Phase 257 (#1318) — secondary item/category memberships only. Never mirrors
// or derives `items.folder_id`; see ADR 0080 clause 2. Tenant-scoped, same as
// Item/ItemFolder — must not be added to NON_TENANT_MODEL_EXPORTS.
const ItemFolderMembership = sequelize.define('ItemFolderMembership', {
  item_folder_membership_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  folder_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'item_folder_memberships',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['item_id'] },
    { fields: ['folder_id', 'item_id'], unique: true, name: 'uq_item_folder_memberships_folder_item' }
  ]
});

export default ItemFolderMembership;
