import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosCatalogOverride = sequelize.define('PosCatalogOverride', {
  pos_catalog_override_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'items',
      key: 'item_id'
    }
  },
  pos_visible: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  pos_image_path: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  pos_image_url: {
    type: DataTypes.STRING(500),
    allowNull: true
  }
}, {
  tableName: 'pos_catalog_overrides',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['item_id'], unique: true }
  ]
});

export default PosCatalogOverride;

