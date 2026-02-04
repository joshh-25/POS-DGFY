import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const JobOrder = sequelize.define('JobOrder', {
  jo_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  jo_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: false
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity_to_produce: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  quantity_produced: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('draft', 'in_progress', 'partial', 'completed', 'cancelled'),
    defaultValue: 'draft'
  },
  quality_check: {
    type: DataTypes.ENUM('pass', 'fail', 'pending'),
    allowNull: true,
    defaultValue: null
  },
  created_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  completion_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  responsible_user: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  completed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    },
    comment: 'User who completed the job order'
  },
  archived_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  archived_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'job_orders',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default JobOrder;

