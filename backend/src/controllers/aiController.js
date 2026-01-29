/**
 * AI Controller
 *
 * Handles HTTP requests for AI-related endpoints.
 * Uses database models for persistence.
 */

import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import * as aiService from '../services/aiService.js';
import PendingAIAction from '../models/PendingAIAction.js';
import AIConversation from '../models/AIConversation.js';
import logger from '../config/logger.js';

/**
 * POST /api/v1/ai/chat
 * Process a chat message
 */
export const chat = async (req, res, next) => {
  try {
    const { message, conversationId } = req.body;
    const user = req.user;

    // Generate or use existing conversation ID
    const convId = conversationId || uuidv4();

    // Get or create conversation
    let conversation = await AIConversation.findByPk(convId);
    if (!conversation) {
      conversation = await AIConversation.create({
        conversation_id: convId,
        user_id: user.user_id,
        messages: [],
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        last_message_at: new Date()
      });
    }

    // Get messages array
    let messages = conversation.messages || [];

    // Check for special queries (capabilities, limitations)
    const specialResponse = aiService.handleSpecialQueries(message);
    if (specialResponse) {
      // Add to conversation history
      messages.push(
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: specialResponse.content, timestamp: new Date().toISOString() }
      );

      // Update conversation
      await conversation.update({
        messages,
        last_message_at: new Date(),
        title: conversation.title || generateConversationTitle(messages)
      });

      return res.json({
        success: true,
        data: {
          ...specialResponse,
          conversationId: convId
        },
        message: 'Response generated',
        timestamp: new Date().toISOString()
      });
    }

    // Process message with AI
    const response = await aiService.processMessage(
      message,
      messages,
      user,
      convId
    );

    // Add user message to history
    messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Handle different response types
    if (response.type === 'confirmation_required') {
      // Store pending action in database
      await PendingAIAction.create({
        action_id: response.action_id,
        user_id: user.user_id,
        conversation_id: convId,
        action_type: response.action_type,
        action_payload: response.details || {},
        description: response.description,
        impact_summary: response.impact_summary || null,
        status: 'pending',
        expires_at: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      });

      // Add AI response to history
      messages.push({
        role: 'assistant',
        content: `🔔 Confirmation required: ${response.description}`,
        timestamp: new Date().toISOString(),
        action_id: response.action_id
      });

    } else if (response.type === 'text') {
      // Add AI response to history
      messages.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString()
      });
    }

    // Update conversation
    await conversation.update({
      messages,
      last_message_at: new Date(),
      title: conversation.title || generateConversationTitle(messages)
    });

    res.json({
      success: true,
      data: response,
      message: 'Response generated',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Chat error:', error);
    next(error);
  }
};

/**
 * POST /api/v1/ai/confirm
 * Confirm and execute a pending action
 */
export const confirmAction = async (req, res, next) => {
  try {
    const { actionId } = req.body;
    const user = req.user;

    // Get pending action from database
    const pendingAction = await PendingAIAction.findByPk(actionId);

    if (!pendingAction) {
      return res.status(404).json({
        success: false,
        message: 'Action not found or has expired',
        timestamp: new Date().toISOString()
      });
    }

    // Verify ownership
    if (pendingAction.user_id !== user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'This action does not belong to you',
        timestamp: new Date().toISOString()
      });
    }

    // Check status
    if (pendingAction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This action has already been ${pendingAction.status}`,
        timestamp: new Date().toISOString()
      });
    }

    // Check expiry
    if (new Date(pendingAction.expires_at) < new Date()) {
      await pendingAction.update({ status: 'expired' });
      return res.status(410).json({
        success: false,
        message: 'This action has expired. Please try again.',
        timestamp: new Date().toISOString()
      });
    }

    // Execute the action
    const actionData = {
      action_type: pendingAction.action_type,
      toolName: pendingAction.action_type,
      args: pendingAction.action_payload,
      conversation_id: pendingAction.conversation_id
    };

    const result = await aiService.executeConfirmedAction(actionId, actionData, user);

    // Update pending action status
    await pendingAction.update({
      status: 'confirmed',
      confirmed_at: new Date(),
      execution_result: result
    });

    // Update conversation history
    if (pendingAction.conversation_id) {
      const conversation = await AIConversation.findByPk(pendingAction.conversation_id);
      if (conversation) {
        const messages = conversation.messages || [];
        messages.push({
          role: 'assistant',
          content: result.message,
          timestamp: new Date().toISOString(),
          action_result: result
        });
        await conversation.update({
          messages,
          last_message_at: new Date()
        });
      }
    }

    res.json({
      success: result.type === 'success',
      data: result,
      message: result.message,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Confirm action error:', error);
    next(error);
  }
};

/**
 * POST /api/v1/ai/cancel
 * Cancel a pending action
 */
export const cancelAction = async (req, res, next) => {
  try {
    const { actionId } = req.body;
    const user = req.user;

    // Get pending action from database
    const pendingAction = await PendingAIAction.findByPk(actionId);

    if (!pendingAction) {
      return res.status(404).json({
        success: false,
        message: 'Action not found or has already been processed',
        timestamp: new Date().toISOString()
      });
    }

    // Verify ownership
    if (pendingAction.user_id !== user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'This action does not belong to you',
        timestamp: new Date().toISOString()
      });
    }

    // Check status
    if (pendingAction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This action has already been ${pendingAction.status}`,
        timestamp: new Date().toISOString()
      });
    }

    // Update status to cancelled
    await pendingAction.update({ status: 'cancelled' });

    // Update conversation history
    if (pendingAction.conversation_id) {
      const conversation = await AIConversation.findByPk(pendingAction.conversation_id);
      if (conversation) {
        const messages = conversation.messages || [];
        messages.push({
          role: 'assistant',
          content: '❌ Action cancelled.',
          timestamp: new Date().toISOString()
        });
        await conversation.update({
          messages,
          last_message_at: new Date()
        });
      }
    }

    res.json({
      success: true,
      data: { actionId, status: 'cancelled' },
      message: 'Action cancelled',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Cancel action error:', error);
    next(error);
  }
};

/**
 * GET /api/v1/ai/conversations
 * Get user's conversation history
 */
export const getConversations = async (req, res, next) => {
  try {
    const user = req.user;

    // Get all non-expired conversations for user
    const conversations = await AIConversation.findAll({
      where: {
        user_id: user.user_id,
        expires_at: { [Op.gt]: new Date() }
      },
      order: [['last_message_at', 'DESC']],
      attributes: ['conversation_id', 'title', 'messages', 'created_at', 'expires_at', 'last_message_at']
    });

    const formattedConversations = conversations.map(conv => {
      const daysUntilExpiry = Math.ceil(
        (new Date(conv.expires_at) - new Date()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: conv.conversation_id,
        title: conv.title || generateConversationTitle(conv.messages || []),
        message_count: (conv.messages || []).length,
        created_at: conv.created_at,
        last_message_at: conv.last_message_at,
        expires_at: conv.expires_at,
        days_until_expiry: daysUntilExpiry,
        expiry_warning: daysUntilExpiry <= 5
      };
    });

    res.json({
      success: true,
      data: {
        conversations: formattedConversations,
        retention_notice: 'Conversations are automatically deleted after 30 days'
      },
      message: 'Conversations retrieved',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get conversations error:', error);
    next(error);
  }
};

/**
 * GET /api/v1/ai/conversations/:id
 * Get a specific conversation
 */
export const getConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const conversation = await AIConversation.findByPk(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
        timestamp: new Date().toISOString()
      });
    }

    if (conversation.user_id !== user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        timestamp: new Date().toISOString()
      });
    }

    // Check if expired
    if (new Date(conversation.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        message: 'This conversation has expired',
        timestamp: new Date().toISOString()
      });
    }

    const daysUntilExpiry = Math.ceil(
      (new Date(conversation.expires_at) - new Date()) / (1000 * 60 * 60 * 24)
    );

    res.json({
      success: true,
      data: {
        id: conversation.conversation_id,
        user_id: conversation.user_id,
        title: conversation.title,
        messages: conversation.messages || [],
        created_at: conversation.created_at,
        expires_at: conversation.expires_at,
        last_message_at: conversation.last_message_at,
        days_until_expiry: daysUntilExpiry,
        expiry_warning: daysUntilExpiry <= 5
      },
      message: 'Conversation retrieved',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get conversation error:', error);
    next(error);
  }
};

/**
 * DELETE /api/v1/ai/conversations/:id
 * Delete a conversation
 */
export const deleteConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const conversation = await AIConversation.findByPk(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
        timestamp: new Date().toISOString()
      });
    }

    if (conversation.user_id !== user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        timestamp: new Date().toISOString()
      });
    }

    // Delete conversation
    await conversation.destroy();

    // Also update any pending actions for this conversation to cancelled
    await PendingAIAction.update(
      { status: 'cancelled' },
      {
        where: {
          conversation_id: id,
          status: 'pending'
        }
      }
    );

    res.json({
      success: true,
      data: { id, status: 'deleted' },
      message: 'Conversation deleted',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Delete conversation error:', error);
    next(error);
  }
};

/**
 * Generate a title for a conversation based on first user message
 */
function generateConversationTitle(messages) {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) {
    return 'New Conversation';
  }

  const content = firstUserMessage.content;
  if (content.length <= 50) {
    return content;
  }

  return content.substring(0, 47) + '...';
}

/**
 * Cleanup expired data (should be run periodically via cron or scheduler)
 */
export const cleanupExpiredData = async () => {
  const now = new Date();

  try {
    // Delete expired conversations
    const deletedConversations = await AIConversation.destroy({
      where: {
        expires_at: { [Op.lt]: now }
      }
    });

    // Update expired pending actions
    const updatedActions = await PendingAIAction.update(
      { status: 'expired' },
      {
        where: {
          expires_at: { [Op.lt]: now },
          status: 'pending'
        }
      }
    );

    if (deletedConversations > 0 || updatedActions[0] > 0) {
      logger.info(`AI cleanup: Deleted ${deletedConversations} conversations, expired ${updatedActions[0]} actions`);
    }
  } catch (error) {
    logger.error('AI cleanup error:', error);
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupExpiredData, 5 * 60 * 1000);

export default {
  chat,
  confirmAction,
  cancelAction,
  getConversations,
  getConversation,
  deleteConversation,
  cleanupExpiredData
};
