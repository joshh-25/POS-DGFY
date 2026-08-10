import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbKitchenTicket = sequelize.define('FnbKitchenTicket', {
  kitchen_ticket_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  check_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  kitchen_station_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  ticket_number: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('queued', 'preparing', 'ready', 'served', 'cancelled'),
    allowNull: false,
    defaultValue: 'queued'
  },
  lines_snapshot: {
    type: DataTypes.JSON,
    allowNull: true
  },
  fired_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  ready_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  served_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'fnb_kitchen_tickets',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['check_id'] },
    { fields: ['kitchen_station_id'] },
    { fields: ['ticket_number'], unique: true },
    { fields: ['status'] }
  ]
});

export default FnbKitchenTicket;
