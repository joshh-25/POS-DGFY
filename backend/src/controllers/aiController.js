/**
 * AI Controller
 *
 * Handles HTTP requests for AI-related endpoints.
 * Uses database models for persistence.
 */

import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
import * as aiService from '../services/aiService.js';
import dbStore from '../utils/dbStore.js';
import logger from '../config/logger.js';

/**
 * POST /api/v1/ai/chat
 */
export const chat = async (req, res, next) => {
  try {
    const { message, conversationId } = req.body;
    const files = req.files || []; // Handled by multer
    const user = req.user;

    // Process files and append content to message
    let finalMessageText = message;
    const imageParts = [];

    if (files.length > 0) {
      console.log(`\n[UPLOAD DEBUG] Received ${files.length} files:`);

      const fileContents = [];

      for (const f of files) {
        console.log(` - ${f.originalname} (${f.mimetype}, ${f.size} bytes)`);

        const ext = f.originalname.split('.').pop()?.toLowerCase() || '';

        // Text-based MIME types
        const textMimeTypes = [
          'text/plain', 'text/csv', 'text/html', 'text/xml', 'text/markdown',
          'text/tab-separated-values', 'text/css', 'text/javascript',
          'application/json', 'application/xml', 'application/javascript',
          'application/x-yaml', 'application/x-www-form-urlencoded'
        ];

        // Text-based file extensions
        const textExtensions = [
          'txt', 'csv', 'json', 'xml', 'md', 'yaml', 'yml', 'html', 'htm',
          'css', 'js', 'ts', 'jsx', 'tsx', 'sql', 'log', 'ini', 'cfg', 'conf',
          'sh', 'bat', 'ps1', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h',
          'go', 'rs', 'env', 'gitignore', 'tsv'
        ];

        const isText = textMimeTypes.some(t => f.mimetype.includes(t)) ||
          textExtensions.includes(ext);

        // Binary file categories
        const excelExtensions = ['xlsx', 'xls', 'xlsm'];
        const pdfExtensions = ['pdf'];
        const wordExtensions = ['docx', 'doc'];
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

        if (isText) {
          try {
            const content = await fs.readFile(f.path, 'utf8');
            const truncated = content.length > 50000;
            const safeContent = truncated ? content.substring(0, 50000) + '\n...[Content truncated at 50KB]...' : content;
            fileContents.push(`\n\n--- FILE: ${f.originalname} (${ext.toUpperCase()}) ---\n${safeContent}\n--- END FILE ---\n`);
            console.log(`  [OK] Read ${content.length} chars from text file`);
          } catch (readErr) {
            console.error(`  [ERR] Failed to read file ${f.originalname}:`, readErr.message);
            fileContents.push(`\n[Error reading file ${f.originalname}: ${readErr.message}]`);
          }
        } else if (excelExtensions.includes(ext)) {
          fileContents.push(`\n\n[Attached Excel File: ${f.originalname}]\n[Note: Excel parsing not yet implemented. Please export to CSV for import functionality.]\n`);
          console.log(`  [INFO] Excel file attached - parsing not yet implemented`);
        } else if (pdfExtensions.includes(ext)) {
          console.log(`  [INFO] Processing PDF file: ${f.originalname}`);
          try {
            const dataBuffer = await fs.readFile(f.path);
            const data = await pdfParse(dataBuffer);
            const content = data.text;

            const truncated = content.length > 50000;
            const safeContent = truncated ? content.substring(0, 50000) + '\n...[Content truncated at 50KB]...' : content;

            fileContents.push(`\n\n--- FILE: ${f.originalname} (PDF) ---\n${safeContent}\n--- END FILE ---\n`);
            console.log(`  [OK] Extracted ${content.length} chars from PDF`);
          } catch (pdfErr) {
            console.error(`  [ERR] Failed to parse PDF ${f.originalname}:`, pdfErr.message);
            fileContents.push(`\n[Error reading PDF ${f.originalname}: ${pdfErr.message}]`);
          }
        } else if (wordExtensions.includes(ext)) {
          console.log(`  [INFO] Processing Word file: ${f.originalname}`);
          try {
            const result = await mammoth.extractRawText({ path: f.path });
            const content = result.value;

            const truncated = content.length > 50000;
            const safeContent = truncated ? content.substring(0, 50000) + '\n...[Content truncated at 50KB]...' : content;

            fileContents.push(`\n\n--- FILE: ${f.originalname} (DOCX) ---\n${safeContent}\n--- END FILE ---\n`);
            console.log(`  [OK] Extracted ${content.length} chars from DOCX`);
          } catch (docErr) {
            console.error(`  [ERR] Failed to parse DOCX ${f.originalname}:`, docErr.message);
            fileContents.push(`\n[Error reading DOCX ${f.originalname}: ${docErr.message}]`);
          }
        } else if (imageExtensions.includes(ext) || f.mimetype.startsWith('image/')) {
          console.log(`  [INFO] Processing Image for Vision: ${f.originalname}`);
          try {
            const imageBuffer = await fs.readFile(f.path);
            const base64Image = imageBuffer.toString('base64');
            // Check if mimetype is valid for data URI, default to jpeg if missing
            const mimeType = f.mimetype || 'image/jpeg';

            imageParts.push({
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            });
            console.log(`  [OK] Converted image to Base64 for Vision API`);
          } catch (imgErr) {
            console.error(`  [ERR] Failed to process image ${f.originalname}:`, imgErr.message);
            fileContents.push(`\n[Error reading Image ${f.originalname}: ${imgErr.message}]`);
          }
        } else {
          fileContents.push(`\n\n[Attached File: ${f.originalname} (${f.mimetype})]\n[Note: This file type is not yet supported for content extraction.]\n`);
          console.log(`  [WARN] Unsupported file type: ${f.mimetype} / .${ext}`);
        }
      }

      if (fileContents.length > 0) {
        finalMessageText += "\n" + fileContents.join('');
      }
    }

    // Construct final message payload (String or Array)
    let messagePayload = finalMessageText;
    if (imageParts.length > 0) {
      messagePayload = [
        { type: "text", text: finalMessageText },
        ...imageParts
      ];
    }

    // DEBUG: Log user info
    console.log(`\n[AUTH DEBUG] User: ${user.username}, Role: ${user.role}, User ID: ${user.user_id}`);

    // Get models from context
    const AIConversation = dbStore.get('AIConversation');
    const PendingAIAction = dbStore.get('PendingAIAction');

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

    // Defensive check: ensure messages is an array (Sequelize JSON sometimes returns string)
    if (typeof messages === 'string') {
      try {
        messages = JSON.parse(messages);
      } catch (e) {
        messages = [];
      }
    }

    if (!Array.isArray(messages)) {
      messages = [];
    }



    // Check for special queries (capabilities, limitations)
    // Note: handleSpecialQueries now expects the TEXT content.
    // aiService.processMessage handles this extraction, but we might want to check here if logic was duplicated.
    // The previous logic called aiService.handleSpecialQueries(message);
    // Since we now have messagePayload, we should pass that to processMessage, which handles extraction.
    // However, the controller block below effectively DUPLICATES the check.
    // Let's rely on aiService.processMessage to handle it if possible, OR extraction here.
    // Ideally, we keep the controller logic for special queries simple:

    // Extract text for local check
    const textForCheck = finalMessageText;

    const specialResponse = aiService.handleSpecialQueries(textForCheck);
    if (specialResponse) {
      // Add to conversation history
      messages.push(
        { role: 'user', content: finalMessageText, timestamp: new Date().toISOString() },
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
      messagePayload, // Pass the complex payload (string or array)
      messages,
      user,
      convId
    );

    // Add user message to history
    // NOTE: If payload is array, we store it as is. Frontend needs to handle rendering.
    // But currently frontend might expect string content.
    // Storing full object is better for future.
    messages.push({
      role: 'user',
      content: messagePayload, // Store the array including images
      timestamp: new Date().toISOString()
    });

    // Handle different response types
    if (response.type === 'confirmation_required') {
      response.message = `🔔 I'm ready to ${response.description.toLowerCase()}. Please confirm to proceed.`;

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
      // Add AI response to history with tool context for memory
      const assistantMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString()
      };

      // Include tool context if available (helps AI remember item/supplier IDs)
      if (response.toolContext) {
        assistantMessage.context = response.toolContext;
      }

      messages.push(assistantMessage);
    }


    // Update conversation

    // Update conversation
    // Force Sequelize to recognize the JSON change (it sometimes misses nested object changes)
    conversation.messages = messages;
    conversation.last_message_at = new Date();
    conversation.title = conversation.title || generateConversationTitle(messages);
    conversation.changed('messages', true);  // Force detection of nested changes

    await conversation.save();

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

    // Get models from context
    const PendingAIAction = dbStore.get('PendingAIAction');
    const AIConversation = dbStore.get('AIConversation');

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

    // Parse action_payload if it's a string (defensive check for JSON fields)
    let actionPayload = pendingAction.action_payload;
    if (typeof actionPayload === 'string') {
      try {
        actionPayload = JSON.parse(actionPayload);
      } catch (e) {
        logger.error('Failed to parse action_payload:', e);
        actionPayload = {};
      }
    }

    // Execute the action
    // We pass the pendingAction model instance or a structured object that matches what executeConfirmedAction expects
    const actionData = {
      action_id: pendingAction.action_id,
      user_id: pendingAction.user_id, // CRITICAL: explicit user_id for the check
      toolName: pendingAction.action_type,
      args: actionPayload,
      conversation_id: pendingAction.conversation_id,
      description: pendingAction.description,
      expires_at: pendingAction.expires_at
    };

    const result = await aiService.executeConfirmedAction(actionId, actionData, user);

    // Update pending action status
    await pendingAction.update({
      status: 'confirmed',
      confirmed_at: new Date(),
      execution_result: result
    });

    let finalMessageContent = result.message;

    // Update conversation history
    if (pendingAction.conversation_id) {
      const conversation = await AIConversation.findByPk(pendingAction.conversation_id);
      if (conversation) {
        // Defensive parsing for messages
        let messages = conversation.messages || [];
        if (typeof messages === 'string') {
          try {
            messages = JSON.parse(messages);
          } catch (e) {
            messages = [];
          }
        }
        if (!Array.isArray(messages)) {
          messages = [];
        }

        // ---------------------------------------------------------
        // Generate AI follow-up
        // ---------------------------------------------------------
        try {
          // We ask the AI to generate a follow-up based on the result
          // We use a hidden system prompt or just inject the result as a context
          const followUpPrompt = `[System Notification]: The user confirmed the action "${pendingAction.description}". It was executed successfully. Result: ${JSON.stringify(result)}. Please provide a short, natural follow-up response to the user, confirming it's done and asking if they need anything else related to this. Do not repeat the technical details excessively, just be helpful.`;

          // We temporarily append this to history for the AI to see, but we don't save the prompt itself to DB history if we want to keep it clean,
          // OR we can just pass it as the 'message' to processMessage.
          // Let's use string concatenation to add the result message to the conversation history logic

          const followUpResponse = await aiService.processMessage(
            followUpPrompt,
            messages, // Pass current history
            user,
            pendingAction.conversation_id
          );

          if (followUpResponse && followUpResponse.content) {
            // Combine the system success message with the AI's natural response
            // This ensures the frontend gets one nice message bubble
            finalMessageContent = `${result.message}\n\n${followUpResponse.content}`;
          }

        } catch (aiError) {
          console.error('Error generating AI follow-up:', aiError);
          // Fallback to just the system message if AI fails
        }

        messages.push({
          role: 'assistant',
          content: finalMessageContent,
          timestamp: new Date().toISOString(),
          action_result: result
        });

        // Force update including the JSON content
        conversation.messages = messages;
        conversation.changed('messages', true);
        conversation.last_message_at = new Date();

        await conversation.save();
      }
    }

    res.json({
      success: result.type === 'success',
      data: {
        ...result,
        message: finalMessageContent // Return the combined message
      },
      message: finalMessageContent,
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

    // Get models from context
    const PendingAIAction = dbStore.get('PendingAIAction');
    const AIConversation = dbStore.get('AIConversation');

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
    const AIConversation = dbStore.get('AIConversation');

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
    const AIConversation = dbStore.get('AIConversation');

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

    let messages = conversation.messages || [];
    if (typeof messages === 'string') {
      try {
        messages = JSON.parse(messages);
      } catch (e) {
        messages = [];
      }
    }
    if (!Array.isArray(messages)) {
      messages = [];
    }

    res.json({
      success: true,
      data: {
        id: conversation.conversation_id,
        user_id: conversation.user_id,
        title: conversation.title,
        messages: messages,
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
    const AIConversation = dbStore.get('AIConversation');
    const PendingAIAction = dbStore.get('PendingAIAction');

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
 * GET /api/v1/ai/exports/:id
 * Download a temporary CSV export file
 */
export const downloadExport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Import tempFileService dynamically to avoid circular deps
    const tempFileService = await import('../services/tempFileService.js');

    const file = await tempFileService.getTemporaryFile(id, user.user_id);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'Export file not found or expired',
        timestamp: new Date().toISOString()
      });
    }

    // Set headers for file download
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(file.content, 'utf8'));

    res.send(file.content);

  } catch (error) {
    logger.error('Download export error:', error);
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
    // Get models from dbStore (will fallback to Landlord DB if no context)
    const AIConversation = dbStore.get('AIConversation');
    const PendingAIAction = dbStore.get('PendingAIAction');

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
