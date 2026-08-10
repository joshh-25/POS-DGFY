/**
 * PendingAIAction Model
 *
 * Stores pending AI actions that require user confirmation before execution.
 * Actions expire after 5 minutes if not confirmed or cancelled.
 */

import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PendingAIAction = sequelize.define('PendingAIAction', {
  action_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  action_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'The tool/function name to execute'
  },
  action_payload: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'The arguments for the tool'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Human-readable description of what this action will do'
  },
  impact_summary: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Summary of the impact (e.g., items affected, values)'
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'cancelled', 'expired'),
    defaultValue: 'pending',
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '5 minutes after creation'
  },
  confirmed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  execution_result: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Result of the action after execution'
  }
}, {
  tableName: 'pending_ai_actions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['conversation_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['expires_at']
    }
  ]
});

export default PendingAIAction;
