import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// accountable_run_id is deliberately NOT declared here -- it is a STORED generated column
// (delivery_run_id when is_accountable=1, else NULL) that enforces "at most one accountable
// personnel row per run" via a unique index. Declaring it on the model would make Sequelize try
// to write it. Same precedent as PosTerminalShift.js not declaring active_terminal_id.
const DeliveryRunPersonnel = sequelize.define('DeliveryRunPersonnel', {
  delivery_run_personnel_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  delivery_run_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  delivery_personnel_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  delivery_personnel_name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  is_accountable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'delivery_run_personnel',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['delivery_run_id', 'delivery_personnel_id'], unique: true },
    { fields: ['delivery_run_id'] },
    { fields: ['delivery_personnel_id'] }
  ]
});

export default DeliveryRunPersonnel;
