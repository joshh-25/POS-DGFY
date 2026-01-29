/**
 * Migration: Create AI Tables
 *
 * Creates tables for:
 * - pending_ai_actions: Stores actions awaiting user confirmation (5-min expiry)
 * - ai_conversations: Stores chat history (30-day retention)
 */

export default {
  async up(queryInterface, Sequelize) {
    // Create pending_ai_actions table
    await queryInterface.createTable('pending_ai_actions', {
      action_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'CASCADE'
      },
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      action_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'The tool/function name to execute'
      },
      action_payload: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: 'The arguments for the tool'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Human-readable description of what this action will do'
      },
      impact_summary: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Summary of the impact (e.g., items affected, values)'
      },
      status: {
        type: Sequelize.ENUM('pending', 'confirmed', 'cancelled', 'expired'),
        defaultValue: 'pending',
        allowNull: false
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '5 minutes after creation'
      },
      confirmed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      execution_result: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Result of the action after execution'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for pending_ai_actions
    await queryInterface.addIndex('pending_ai_actions', ['user_id'], {
      name: 'idx_pending_ai_actions_user_id'
    });
    await queryInterface.addIndex('pending_ai_actions', ['conversation_id'], {
      name: 'idx_pending_ai_actions_conversation_id'
    });
    await queryInterface.addIndex('pending_ai_actions', ['status'], {
      name: 'idx_pending_ai_actions_status'
    });
    await queryInterface.addIndex('pending_ai_actions', ['expires_at'], {
      name: 'idx_pending_ai_actions_expires_at'
    });

    // Create ai_conversations table
    await queryInterface.createTable('ai_conversations', {
      conversation_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'CASCADE'
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Auto-generated from first message or user-defined'
      },
      messages: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: 'Array of message objects: [{role, content, timestamp, tool_calls?}]'
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '30 days after creation'
      },
      last_message_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp of the most recent message'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for ai_conversations
    await queryInterface.addIndex('ai_conversations', ['user_id'], {
      name: 'idx_ai_conversations_user_id'
    });
    await queryInterface.addIndex('ai_conversations', ['expires_at'], {
      name: 'idx_ai_conversations_expires_at'
    });
    await queryInterface.addIndex('ai_conversations', ['last_message_at'], {
      name: 'idx_ai_conversations_last_message_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('pending_ai_actions');
    await queryInterface.dropTable('ai_conversations');
  }
};
