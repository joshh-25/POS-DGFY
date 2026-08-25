import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosDrawerHandoffEvent = sequelize.define('PosDrawerHandoffEvent', {
  pos_drawer_handoff_event_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  pos_terminal_shift_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  terminal_id: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  event_type: {
    type: DataTypes.ENUM('shared_relief_start', 'shared_relief_end', 'counted_custody_transfer'),
    allowNull: false
  },
  custody_mode: {
    type: DataTypes.ENUM('shared_access', 'counted_transfer'),
    allowNull: false
  },
  outgoing_operator_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  incoming_operator_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  expected_cash_amount: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: true
  },
  counted_cash_amount: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: true
  },
  variance_amount: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: true
  },
  outgoing_acknowledged_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  outgoing_acknowledged_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  incoming_acknowledged_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  incoming_acknowledged_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  recorded_by: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  event_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  idempotency_key: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  note: {
    type: DataTypes.STRING(500),
    allowNull: true
  }
}, {
  tableName: 'pos_drawer_handoff_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_pos_drawer_handoff_events_shift_event', fields: ['pos_terminal_shift_id', 'event_at'] },
    { name: 'idx_pos_drawer_handoff_events_terminal_event', fields: ['terminal_id', 'event_at'] },
    { name: 'idx_pos_drawer_handoff_events_location_event', fields: ['location_id', 'event_at'] },
    { name: 'idx_pos_drawer_handoff_events_type_event', fields: ['event_type', 'event_at'] },
    { name: 'idx_pos_drawer_handoff_events_incoming_event', fields: ['incoming_operator_user_id', 'event_at'] },
    { name: 'idx_pos_drawer_handoff_events_outgoing_event', fields: ['outgoing_operator_user_id', 'event_at'] },
    { name: 'uq_pos_drawer_handoff_events_shift_idempotency', unique: true, fields: ['pos_terminal_shift_id', 'idempotency_key'] }
  ]
});

export default PosDrawerHandoffEvent;
