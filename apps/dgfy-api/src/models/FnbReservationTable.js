import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbReservationTable = sequelize.define('FnbReservationTable', {
  reservation_table_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  reservation_request_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  table_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'fnb_reservation_tables',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['reservation_request_id', 'table_id'], unique: true },
    { fields: ['table_id'] }
  ]
});

export default FnbReservationTable;
