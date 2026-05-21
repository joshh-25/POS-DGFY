/**
 * AIConversation Model
 *
 * Stores AI chat conversation history with 30-day retention.
 * Messages are stored as JSON array.
 */

import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const AIConversation = sequelize.define('AIConversation', {
  conversation_id: {
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
  title: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Auto-generated from first message or user-defined'
  },
  messages: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    comment: 'Array of message objects: [{role, content, timestamp, tool_calls?}]'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '30 days after creation'
  },
  last_message_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of the most recent message'
  }
}, {
  tableName: 'ai_conversations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['expires_at']
    },
    {
      fields: ['last_message_at']
    }
  ]
});

export default AIConversation;
