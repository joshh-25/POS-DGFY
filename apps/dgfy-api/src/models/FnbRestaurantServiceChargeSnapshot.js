import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbRestaurantServiceChargeSnapshot = sequelize.define('FnbRestaurantServiceChargeSnapshot', {
  service_charge_snapshot_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  pos_transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  check_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  label_snapshot: {
    type: DataTypes.STRING(120),
    allowNull: false,
    defaultValue: 'Restaurant service charge'
  },
  amount: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },
  rate_snapshot: {
    type: DataTypes.DECIMAL(7, 4),
    allowNull: true
  },
  taxable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  settings_snapshot: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'fnb_restaurant_service_charge_snapshots',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['pos_transaction_id'] },
    { fields: ['check_id'] }
  ]
});

export default FnbRestaurantServiceChargeSnapshot;
