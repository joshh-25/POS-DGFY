/**
 * AI Service
 *
 * Core service for OpenAI integration. Handles:
 * - Message processing with function calling
 * - Tool execution orchestration
 * - Confirmation workflow management
 * - Conversation history
 */

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';
import { buildSystemPrompt, getCapabilitiesExplanation, getLimitationsExplanation } from '../config/aiSystemPrompt.js';
import { getOpenAITools, getToolByName, toolRequiresConfirmation } from '../config/aiTools.js';
import { buildContext, hasPermission, getPermissionError } from './aiContextService.js';
import * as toolExecutor from './aiToolExecutor.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

/**
 * Process a user message and return AI response
 * @param {string} message - User's message
 * @param {Array} conversationHistory - Previous messages
 * @param {Object} user - User object with id, role, etc.
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} AI response
 */
export const processMessage = async (message, conversationHistory = [], user, conversationId) => {
  try {
    // Build context for system prompt
    const context = await buildContext(user.user_id);

    // Get tools available for user's role
    const tools = getOpenAITools(user.role);

    // Build messages array
    const messages = [
      { role: 'system', content: buildSystemPrompt(context) },
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.7,
      max_tokens: 4096
    });

    const assistantMessage = response.choices[0].message;

    // Check if the model wants to call a tool
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      return await handleToolCalls(
        assistantMessage,
        messages,
        user,
        conversationId,
        context
      );
    }

    // Regular text response
    return {
      type: 'text',
      content: assistantMessage.content,
      conversationId
    };

  } catch (error) {
    logger.error('AI processing error:', error);

    if (error.code === 'insufficient_quota') {
      return {
        type: 'error',
        content: 'The AI service is temporarily unavailable due to quota limits. Please try again later or contact support.',
        conversationId
      };
    }

    if (error.code === 'invalid_api_key') {
      return {
        type: 'error',
        content: 'AI service configuration error. Please contact the administrator.',
        conversationId
      };
    }

    return {
      type: 'error',
      content: 'I encountered an error processing your request. Please try again.',
      conversationId,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

/**
 * Handle tool calls from the AI
 * @param {Object} assistantMessage - The assistant's message with tool calls
 * @param {Array} messages - Current message history
 * @param {Object} user - User object
 * @param {string} conversationId - Conversation ID
 * @param {Object} context - Current context
 * @returns {Promise<Object>} Response with confirmation or result
 */
const handleToolCalls = async (assistantMessage, messages, user, conversationId, context) => {
  const toolCalls = assistantMessage.tool_calls;
  const results = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const toolArgs = JSON.parse(toolCall.function.arguments);
    const tool = getToolByName(toolName);

    // Check permissions
    if (tool && tool.requiredRole && !hasPermission(user.role, tool.requiredRole)) {
      results.push({
        tool_call_id: toolCall.id,
        type: 'permission_denied',
        toolName,
        message: getPermissionError(toolName.replace(/_/g, ' '), tool.requiredRole)
      });
      continue;
    }

    // Check if tool requires confirmation
    if (toolRequiresConfirmation(toolName)) {
      // Generate confirmation request
      const confirmation = await generateConfirmation(
        toolName,
        toolArgs,
        user,
        conversationId,
        context
      );
      results.push({
        tool_call_id: toolCall.id,
        type: 'confirmation_required',
        ...confirmation
      });
    } else {
      // Execute read-only tool directly
      try {
        const result = await toolExecutor.execute(toolName, toolArgs, user);
        results.push({
          tool_call_id: toolCall.id,
          type: 'result',
          toolName,
          result
        });
      } catch (error) {
        logger.error(`Tool execution error for ${toolName}:`, error);
        results.push({
          tool_call_id: toolCall.id,
          type: 'error',
          toolName,
          message: error.message
        });
      }
    }
  }

  // If any tool requires confirmation, return confirmation request
  const confirmationRequired = results.find(r => r.type === 'confirmation_required');
  if (confirmationRequired) {
    return {
      type: 'confirmation_required',
      action_id: confirmationRequired.action_id,
      action_type: confirmationRequired.toolName,
      description: confirmationRequired.description,
      details: confirmationRequired.details,
      expires_in: 300, // 5 minutes
      conversationId
    };
  }

  // If any tool had permission denied, return error
  const permissionDenied = results.find(r => r.type === 'permission_denied');
  if (permissionDenied) {
    return {
      type: 'text',
      content: `❌ ${permissionDenied.message}`,
      conversationId
    };
  }

  // All tools executed successfully, get final response from AI
  const toolResults = results.map(r => ({
    tool_call_id: r.tool_call_id,
    role: 'tool',
    content: JSON.stringify(r.result || { error: r.message })
  }));

  // Continue conversation with tool results
  const updatedMessages = [
    ...messages,
    assistantMessage,
    ...toolResults
  ];

  const finalResponse = await openai.chat.completions.create({
    model: MODEL,
    messages: updatedMessages,
    temperature: 0.7,
    max_tokens: 4096
  });

  return {
    type: 'text',
    content: finalResponse.choices[0].message.content,
    conversationId,
    toolsExecuted: results.map(r => r.toolName)
  };
};

/**
 * Generate a confirmation request for a write operation
 * @param {string} toolName - Name of the tool
 * @param {Object} args - Tool arguments
 * @param {Object} user - User object
 * @param {string} conversationId - Conversation ID
 * @param {Object} context - Current context
 * @returns {Promise<Object>} Confirmation details
 */
const generateConfirmation = async (toolName, args, user, conversationId, context) => {
  const actionId = uuidv4();

  // Build human-readable description based on tool
  let description = '';
  let details = {};

  switch (toolName) {
    case 'create_item':
      description = `Create new item "${args.name}" (${args.sku_code})`;
      details = {
        sku_code: args.sku_code,
        name: args.name,
        category: args.category,
        max_capacity: args.max_capacity,
        unit: args.unit_of_measure,
        auto_calculated: {
          min_threshold: Math.round(args.max_capacity * 0.4),
          purchase_allowance: Math.round(args.max_capacity * 0.2)
        }
      };
      break;

    case 'update_item':
      description = `Update item ID ${args.item_id}`;
      details = { ...args };
      break;

    case 'delete_item':
      description = `Delete item ID ${args.item_id}`;
      details = {
        item_id: args.item_id,
        reason: args.reason,
        note: 'This is a soft delete. The item can be restored later.'
      };
      break;

    case 'create_purchase_order':
      description = `Create Purchase Order for supplier ID ${args.supplier_id}`;
      details = {
        supplier_id: args.supplier_id,
        items: args.items,
        item_count: args.items.length,
        expected_delivery: args.expected_delivery_date
      };
      break;

    case 'receive_purchase_order':
      description = `Receive Purchase Order #${args.po_id}`;
      details = {
        po_id: args.po_id,
        items_to_receive: args.received_items?.length || 'all',
        note: 'This will create FIFO batches and update stock levels.'
      };
      break;

    case 'create_job_order':
      description = `Create Job Order to produce ${args.quantity_to_produce} units of product ID ${args.product_id}`;
      details = {
        product_id: args.product_id,
        quantity: args.quantity_to_produce,
        note: 'This will reserve ingredients for production.'
      };
      break;

    case 'complete_job_order':
      description = `Complete Job Order #${args.jo_id}`;
      details = {
        jo_id: args.jo_id,
        quantity_produced: args.quantity_produced,
        expiry_date: args.expiry_date,
        note: 'This will consume ingredients via FIFO and create finished goods batch.'
      };
      break;

    case 'create_stock_adjustment':
      description = `Stock adjustment for item ID ${args.item_id}: ${args.quantity > 0 ? '+' : ''}${args.quantity}`;
      details = {
        item_id: args.item_id,
        quantity: args.quantity,
        type: args.movement_type,
        reason: args.reason
      };
      break;

    case 'import_csv_data':
      description = `Import ${args.entity_type} from CSV data`;
      details = {
        entity_type: args.entity_type,
        preview: 'Parsing CSV for preview...',
        options: args.options
      };
      break;

    default:
      description = `Execute ${toolName.replace(/_/g, ' ')}`;
      details = args;
  }

  // Store pending action (will be implemented in Phase 3)
  // For now, we'll store in memory or return for client-side handling

  return {
    action_id: actionId,
    toolName,
    args,
    description,
    details,
    user_id: user.user_id,
    conversation_id: conversationId,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
  };
};

/**
 * Execute a confirmed action
 * @param {string} actionId - The action ID to execute
 * @param {Object} user - User executing the action
 * @returns {Promise<Object>} Execution result
 */
export const executeConfirmedAction = async (actionId, pendingAction, user) => {
  try {
    // Verify action belongs to user
    if (pendingAction.user_id !== user.user_id) {
      throw new Error('This action does not belong to you');
    }

    // Check if expired
    if (new Date(pendingAction.expires_at) < new Date()) {
      throw new Error('This action has expired. Please try again.');
    }

    // Execute the tool
    const result = await toolExecutor.execute(
      pendingAction.toolName,
      pendingAction.args,
      user
    );

    return {
      type: 'success',
      action_id: actionId,
      toolName: pendingAction.toolName,
      result,
      message: `✅ ${pendingAction.description} completed successfully!`
    };

  } catch (error) {
    logger.error('Action execution error:', error);
    return {
      type: 'error',
      action_id: actionId,
      message: `❌ Failed to execute action: ${error.message}`
    };
  }
};

/**
 * Handle special queries about capabilities
 * @param {string} message - User message
 * @returns {Object|null} Special response or null
 */
export const handleSpecialQueries = (message) => {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('what can you do') ||
      lowerMessage.includes('what are your capabilities') ||
      lowerMessage.includes('help me understand')) {
    return {
      type: 'text',
      content: getCapabilitiesExplanation()
    };
  }

  if (lowerMessage.includes("what can't you do") ||
      lowerMessage.includes('what are your limitations') ||
      lowerMessage.includes('what you cannot do')) {
    return {
      type: 'text',
      content: getLimitationsExplanation()
    };
  }

  return null;
};

export default {
  processMessage,
  executeConfirmedAction,
  handleSpecialQueries
};
