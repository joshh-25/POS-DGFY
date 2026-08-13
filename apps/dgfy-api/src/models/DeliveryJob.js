import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DeliveryJob = sequelize.define('DeliveryJob', {
  delivery_job_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  pos_transaction_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  location_id: { type: DataTypes.INTEGER, allowNull: true },
  delivery_personnel_id: { type: DataTypes.INTEGER, allowNull: true },
  delivery_personnel_name: { type: DataTypes.STRING(255), allowNull: true },
  assigned_by: { type: DataTypes.INTEGER, allowNull: true },
  assigned_shift_id: { type: DataTypes.INTEGER, allowNull: true },
  assigned_at: { type: DataTypes.DATE, allowNull: true },
  provider: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'manual' },
  provider_delivery_id: { type: DataTypes.STRING(120), allowNull: true, unique: true },
  status: { type: DataTypes.ENUM('pending_dispatch', 'assigned', 'picked_up', 'delivered', 'failed', 'cancelled'), allowNull: false, defaultValue: 'pending_dispatch' },
  tracking_url: { type: DataTypes.STRING(1000), allowNull: true },
  pickup_ready_at: { type: DataTypes.DATE, allowNull: true },
  picked_up_at: { type: DataTypes.DATE, allowNull: true },
  delivered_at: { type: DataTypes.DATE, allowNull: true },
  failure_reason: { type: DataTypes.STRING(500), allowNull: true },
  provider_payload: { type: DataTypes.JSON, allowNull: true }
}, {
  tableName: 'delivery_jobs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['pos_transaction_id'], unique: true },
    { fields: ['location_id', 'status'] },
    { fields: ['delivery_personnel_id', 'status'] },
    { fields: ['provider', 'provider_delivery_id'] }
  ]
});

export default DeliveryJob;
