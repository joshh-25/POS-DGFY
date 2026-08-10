import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const StorefrontLocationItemOverride = sequelize.define('StorefrontLocationItemOverride', {
  storefront_location_item_override_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'items',
      key: 'item_id'
    }
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tenant_locations',
      key: 'location_id'
    }
  },
  storefront_available: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'storefront_location_item_overrides',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['item_id', 'location_id'] },
    { fields: ['location_id'] },
    { fields: ['storefront_available'] }
  ]
});

export default StorefrontLocationItemOverride;
