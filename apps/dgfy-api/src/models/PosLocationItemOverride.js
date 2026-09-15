import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// POS branch applicability is a separate aggregate from the tenant-wide
// PosCatalogOverride.  A missing row means the company POS policy is inherited;
// a row stores an explicit branch override only.
const PosLocationItemOverride = sequelize.define('PosLocationItemOverride', {
  pos_location_item_override_id: {
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
  pos_available: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'pos_location_item_overrides',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['item_id', 'location_id'] },
    { fields: ['location_id'] },
    { fields: ['pos_available'] }
  ]
});

export default PosLocationItemOverride;
