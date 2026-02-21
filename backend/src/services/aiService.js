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
import { buildContext, hasPermission, getPermissionError, hasGranularPermission, getGranularPermissionError } from './aiContextService.js';
import * as toolExecutor from './aiToolExecutor.js';
import { AiUsageLog } from '../models/index.js';

const RATES = {
  'gpt-4o': { input: 5.00 / 1000000, output: 15.00 / 1000000 },
  'gpt-4o-mini': { input: 0.150 / 1000000, output: 0.600 / 1000000 }
};

/**
 * Log AI usage to database
 * @param {Object} usage - Usage object from OpenAI response
 * @param {string} model - Model used
 * @param {Object} user - User object
 */
const logAiUsage = async (usage, model, user) => {
  if (!usage || !user) return;

  try {
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;

    let cost = 0;
    const rate = RATES[model] || RATES['gpt-4o']; // Default to gpt-4o if unknown

    cost = (inputTokens * rate.input) + (outputTokens * rate.output);

    await AiUsageLog.create({
      tenant_id: user.tenant_id,
      user_id: user.user_id,
      model: model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost.toFixed(6)
    });
  } catch (error) {
    logger.error('Failed to log AI usage:', error);
    // Don't block the response if logging fails
  }
};

// Lazy initialize OpenAI client
let _openai = null;
const getOpenAI = () => {
  if (_openai) return _openai;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured. Please add it to your environment.');
  }
  _openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  return _openai;
};

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

    // Build messages array with context preservation
    // DEBUG: Log conversation history to trace context flow
    console.log(`\n========== [CONTEXT DEBUG] aiService.processMessage ==========`);
    console.log(`Processing message. History has ${conversationHistory.length} messages`);
    conversationHistory.forEach((msg, idx) => {
      console.log(`History[${idx}]: role=${msg.role}, hasContext=${!!msg.context}, contextKeys=${msg.context ? Object.keys(msg.context).join(',') : 'none'}`);
    });
    console.log(`===============================================================\n`);

    // Extract text for special query handling
    let textContent = '';
    if (typeof message === 'string') {
      textContent = message;
    } else if (Array.isArray(message)) {
      // Find text part
      const textPart = message.find(m => m.type === 'text');
      if (textPart) textContent = textPart.text;
    } else if (typeof message === 'object' && message.content) {
      // Handle case where message is already an object wrapper
      textContent = message.content;
    }

    // Check for special queries (capabilities, limitations)
    const specialResponse = handleSpecialQueries(textContent);
    if (specialResponse) {
      // ... special response logic (return early)
      return {
        ...specialResponse,
        conversationId
      };
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(context) },
      ...conversationHistory.map(msg => {
        // For assistant messages with tool context, append it to help AI remember
        if (msg.role === 'assistant' && msg.context) {
          const contextSummary = formatContextForMemory(msg.context);
          console.log(`[CONTEXT DEBUG] APPENDING context to assistant message: ${contextSummary}`);
          return {
            role: msg.role,
            content: `${msg.content}\n\n[Context from tools: ${contextSummary}]`
          };
        }
        return {
          role: msg.role,
          content: msg.content
        };
      }),
      { role: 'user', content: message } // OpenAI supports array content here
    ];

    // Call OpenAI API
    const response = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.7,
      max_tokens: 4096
    });

    if (response.usage) {
      await logAiUsage(response.usage, response.model, user);
    }

    const assistantMessage = response.choices[0].message;

    // Check if the model wants to call a tool
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      return await handleToolCalls(
        assistantMessage,
        messages,
        user,
        conversationId,
        context,
        tools,  // Pass tools for chaining
        [],     // Initial empty list of executed tools
        0,      // Initial iteration count
        []      // Initial empty list of accumulated results
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
 * Handle tool calls from the AI with support for chaining (multiple sequential tool calls)
 * @param {Object} assistantMessage - The assistant's message with tool calls
 * @param {Array} messages - Current message history
 * @param {Object} user - User object
 * @param {string} conversationId - Conversation ID
 * @param {Object} context - Current context
 * @param {Array} tools - Available tools for the user's role
 * @param {Array} allToolsExecuted - Accumulator for all tools executed across iterations
 * @param {number} iteration - Current iteration count (for safety limit)
 * @returns {Promise<Object>} Response with confirmation or result
 */
const MAX_TOOL_ITERATIONS = 5; // Safety limit to prevent infinite loops

const handleToolCalls = async (assistantMessage, messages, user, conversationId, context, tools = [], allToolsExecuted = [], iteration = 0, allResults = []) => {
  // Safety check: prevent infinite tool call loops
  if (iteration >= MAX_TOOL_ITERATIONS) {
    logger.warn(`AI reached max tool iterations (${MAX_TOOL_ITERATIONS}), forcing response`);
    return {
      type: 'text',
      content: 'I gathered the information but reached my processing limit. Here\'s what I found so far. Please ask a follow-up question if you need more details.',
      conversationId,
      toolsExecuted: allToolsExecuted
    };
  }

  const toolCalls = assistantMessage.tool_calls;
  const results = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const toolArgs = JSON.parse(toolCall.function.arguments);
    const tool = getToolByName(toolName);

    // Check role-based permissions
    if (tool && tool.requiredRole && !hasPermission(user.role, tool.requiredRole)) {
      results.push({
        tool_call_id: toolCall.id,
        type: 'permission_denied',
        toolName,
        message: getPermissionError(toolName.replace(/_/g, ' '), tool.requiredRole)
      });
      continue;
    }

    // Check granular permissions (if tool requires specific permission)
    if (tool && tool.requiredPermission && !hasGranularPermission(user, tool.requiredPermission)) {
      results.push({
        tool_call_id: toolCall.id,
        type: 'permission_denied',
        toolName,
        message: getGranularPermissionError(toolName.replace(/_/g, ' '), tool.requiredPermission)
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

  // Track all tools executed so far
  const currentToolsExecuted = [...allToolsExecuted, ...results.map(r => r.toolName)];

  // Make follow-up API call WITH tools enabled for chaining
  const finalResponse = await getOpenAI().chat.completions.create({
    model: MODEL,
    messages: updatedMessages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    temperature: 0.7,
    max_tokens: 4096
  });

  if (finalResponse.usage) {
    await logAiUsage(finalResponse.usage, finalResponse.model, user);
  }

  const finalMessage = finalResponse.choices[0].message;

  // Check if AI wants to call more tools (chaining)
  if (finalMessage.tool_calls && finalMessage.tool_calls.length > 0) {
    logger.info(`AI chaining tool calls (iteration ${iteration + 1}): ${finalMessage.tool_calls.map(tc => tc.function.name).join(', ')}`);

    // Recursively handle the next round of tool calls
    // Pass accumulated results so we don't lose context from earlier iterations
    return await handleToolCalls(
      finalMessage,
      updatedMessages,
      user,
      conversationId,
      context,
      tools,
      currentToolsExecuted,
      iteration + 1,
      [...allResults, ...results]  // Accumulate all results
    );
  }

  // No more tool calls, return the final text response
  // Extract key context from ALL tool results (including previous iterations) for conversation memory
  const allAccumulatedResults = [...allResults, ...results];
  const toolContext = extractToolContext(allAccumulatedResults);

  console.log(`\n[CONTEXT DEBUG] EXTRACTED tool context:`, JSON.stringify(toolContext, null, 2));

  return {
    type: 'text',
    content: finalMessage.content,
    conversationId,
    toolsExecuted: currentToolsExecuted,
    toolContext  // Include structured data for conversation memory
  };
};

/**
 * Extract key context from tool results for conversation memory
 * This helps the AI remember item IDs, supplier IDs, etc. across turns
 * @param {Array} results - Tool execution results
 * @returns {Object} Extracted context
 */
function extractToolContext(results) {
  const context = {
    items: [],
    suppliers: [],
    purchaseOrders: [],
    jobOrders: []
  };

  for (const r of results) {
    if (r.type !== 'result' || !r.result) continue;

    const result = r.result;

    // Extract items from get_items or get_item_details
    if (r.toolName === 'get_items' && result.items) {
      context.items.push(...result.items.map(item => ({
        id: item.id,
        sku_code: item.sku_code,
        name: item.name,
        category: item.category
      })));
    }

    if (r.toolName === 'get_item_details') {
      context.items.push({
        id: result.id,
        sku_code: result.sku_code,
        name: result.name,
        category: result.category,
        suppliers: result.suppliers || []
      });
      // Also extract suppliers from item details
      if (result.suppliers && result.suppliers.length > 0) {
        context.suppliers.push(...result.suppliers.map(s => ({
          id: s.supplier_id,
          name: s.name,
          price_per_unit: s.price_per_unit,
          moq: s.moq,
          for_item: result.name
        })));
      }
    }

    // Extract suppliers from get_suppliers
    if (r.toolName === 'get_suppliers' && result.suppliers) {
      context.suppliers.push(...result.suppliers.map(s => ({
        id: s.id,
        name: s.name
      })));
    }

    // Extract supplier details
    if (r.toolName === 'get_supplier_details') {
      context.suppliers.push({
        id: result.supplier_id,
        name: result.name,
        items_supplied: result.items_supplied
      });
    }
  }

  // Only return non-empty context
  const filteredContext = {};
  if (context.items.length > 0) filteredContext.items = context.items;
  if (context.suppliers.length > 0) filteredContext.suppliers = context.suppliers;

  return Object.keys(filteredContext).length > 0 ? filteredContext : null;
}

/**
 * Format context for memory - creates a concise summary for the AI to remember
 * @param {Object} context - The extracted tool context
 * @returns {string} Formatted context string
 */
function formatContextForMemory(context) {
  const parts = [];

  if (context.items && context.items.length > 0) {
    const itemSummaries = context.items.map(item => {
      let summary = `Item "${item.name}" (ID: ${item.id}, SKU: ${item.sku_code})`;
      if (item.suppliers && item.suppliers.length > 0) {
        const supplierInfo = item.suppliers.map(s =>
          `${s.name} (ID: ${s.supplier_id}, $${s.price_per_unit}/unit, MOQ: ${s.moq})`
        ).join(', ');
        summary += ` - Suppliers: ${supplierInfo}`;
      }
      return summary;
    });
    parts.push(`Items: ${itemSummaries.join('; ')}`);
  }

  if (context.suppliers && context.suppliers.length > 0) {
    const supplierSummaries = context.suppliers.map(s => {
      let summary = `"${s.name}" (ID: ${s.id})`;
      if (s.price_per_unit) summary += ` at $${s.price_per_unit}/unit`;
      if (s.moq) summary += `, MOQ: ${s.moq}`;
      if (s.for_item) summary += ` for ${s.for_item}`;
      return summary;
    });
    parts.push(`Suppliers: ${supplierSummaries.join('; ')}`);
  }

  return parts.join(' | ') || 'No specific entities found';
}

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

    case 'create_purchase_order': {
      const totalCalc = args.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0);
      description = `Create Purchase Order for ${args.supplier_name || `supplier ID ${args.supplier_id}`}`;
      details = {
        supplier_id: args.supplier_id,
        supplier_name: args.supplier_name,
        items: args.items,
        item_count: args.items.length,
        total_amount: totalCalc,
        expected_delivery: args.expected_delivery_date
      };
      break;
    }

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
      // CRITICAL: Store all args including csv_content for re-execution after confirmation
      details = {
        entity_type: args.entity_type,
        csv_content: args.csv_content,
        options: args.options,
        _confirmed: true  // Flag to indicate this is a confirmed execution
      };
      break;

    // Supplier Management
    case 'create_supplier':
      description = `Register new supplier "${args.name}"`;
      details = { ...args };
      break;

    case 'update_supplier':
      description = `Update details for supplier ID ${args.supplier_id}`;
      details = { ...args };
      break;

    case 'delete_supplier':
      description = `Delete supplier ID ${args.supplier_id}`;
      details = {
        supplier_id: args.supplier_id,
        reason: args.reason,
        note: 'This will soft-delete the supplier.'
      };
      break;

    case 'add_supplier_item':
      description = `Link item ID ${args.item_id} to supplier ID ${args.supplier_id}`;
      details = {
        item_id: args.item_id,
        supplier_id: args.supplier_id,
        price: args.price_per_unit,
        moq: args.moq
      };
      break;

    // System Settings
    case 'update_system_settings':
      description = `Update system configuration settings`;
      details = {
        updates: args.updates,
        count: Object.keys(args.updates || {}).length
      };
      break;

    // User Management
    case 'update_user_role':
      description = `Change user ID ${args.target_user_id} role to ${args.new_role}`;
      details = { ...args };
      break;

    case 'toggle_user_status':
      description = `${args.is_active ? 'Reactivate' : 'Deactivate'} user ID ${args.target_user_id}`;
      details = { ...args };
      break;

    case 'update_user_permissions':
      description = `Update permissions for user ID ${args.target_user_id}`;
      details = {
        target_user_id: args.target_user_id,
        permission_count: args.permissions?.length || 0,
        permissions: args.permissions,
        note: 'This will replace the user\'s current permissions with the new set.'
      };
      break;

    case 'create_user_invitation':
      description = `Send invitation to ${args.email} as ${args.role}`;
      details = {
        email: args.email,
        role: args.role,
        note: 'An email invitation will be sent with a link to set up their account. The invitation expires in 7 days.'
      };
      break;

    case 'import_users_csv':
      description = `Import users from CSV and send invitations`;
      details = {
        csv_content: args.csv_content,
        total_rows: args._preview?.total || 'multiple',
        _confirmed: true,
        note: 'Invitation emails will be sent to each valid email address in the CSV.'
      };
      break;

    // File Management
    case 'create_folder':
      description = `Create new folder: "${args.path}"`;
      details = {
        path: args.path,
        location: 'uploads/' + args.path
      };
      break;

    case 'move_file':
      description = `Move "${args.source}" to "${args.destination}"`;
      details = {
        from: args.source,
        to: args.destination,
        note: 'This operation is within the uploads directory.'
      };
      break;

    // Inventory Grouping
    case 'create_inventory_folder':
      description = `Create inventory folder "${args.name}"`;
      details = {
        name: args.name,
        description: args.description || '(none)',
        note: 'This creates a logical folder to organize inventory items.'
      };
      break;

    case 'move_items_to_inventory_folder':
      description = `Move ${args.item_ids?.length || 0} item(s) to folder "${args.folder_name}"`;
      details = {
        folder_name: args.folder_name,
        item_count: args.item_ids?.length || 0,
        item_ids: args.item_ids
      };
      break;

    case 'bulk_create_inventory_folders':
      description = `Create ${args.folders.length} inventory folders`;
      details = {
        folder_count: args.folders.length,
        folders: args.folders.map(f => ({
          name: f.name,
          description: f.description || '(none)'
        })),
        note: 'All folders will be created in a single operation.'
      };
      break;

    case 'delete_inventory_folder':
      description = `Delete inventory folder "${args.folder_name}"`;
      details = {
        folder_name: args.folder_name,
        note: 'Items inside this folder will be automatically unassigned (moved to uncategorized).'
      };
      break;

    case 'bulk_delete_inventory_folders':
      description = `Delete ${args.folder_names.length} inventory folders`;
      details = {
        folder_count: args.folder_names.length,
        folder_names: args.folder_names,
        note: 'All items inside these folders will be automatically unassigned. This action cannot be undone.'
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

    // Security Fix: TOCTOU Permission Check
    // Re-verify that the user still has permission to execute this tool
    // (Role or permissions might have changed since valid confirmation was generated)
    const tool = getToolByName(pendingAction.toolName);

    if (tool) {
      // 1. Check Role Permission
      if (tool.requiredRole && !hasPermission(user.role, tool.requiredRole)) {
        throw new Error(getPermissionError(pendingAction.toolName.replace(/_/g, ' '), tool.requiredRole));
      }

      // 2. Check Granular Permission
      if (tool.requiredPermission && !hasGranularPermission(user, tool.requiredPermission)) {
        throw new Error(getGranularPermissionError(pendingAction.toolName.replace(/_/g, ' '), tool.requiredPermission));
      }
    }

    // Execute the tool
    const result = await toolExecutor.execute(
      pendingAction.toolName,
      pendingAction.args,
      user
    );

    // Format result for UI (Success Card)
    const uiResult = formatResultForUI(pendingAction.toolName, pendingAction.args, result);

    return {
      type: 'success',
      action_id: actionId,
      toolName: pendingAction.toolName,
      result: uiResult, // Enhanced result for UI
      message: `✅ ${uiResult.summary || pendingAction.description} completed successfully!`
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
 * Format raw tool execution results into a structured UI-friendly format
 * @param {string} toolName - Name of the tool executed
 * @param {Object} args - Arguments passed to the tool
 * @param {Object} result - Raw result from tool executor
 * @returns {Object} Structured UI result with summary, impact, and details
 */
const formatResultForUI = (toolName, args, result) => {
  // Base structure
  const uiResult = {
    success: true,
    summary: result.message || 'Action Completed',
    details: {},      // Detailed attributes (read-only chips)
    impact: {},       // Key business metrics (stats grid)
    related_entity: result.related_entity || null
  };

  try {
    switch (toolName) {
      // --- ITEMS ---
      case 'create_item':
        uiResult.summary = `Item "${result.item.name}" Created`;
        uiResult.impact = {
          "Stock Tracking": result.item.fifo_enabled ? "Enabled (FIFO)" : "Disabled",
          "Initial Stock": "0 " + result.item.unit_of_measure,
          "Max Capacity": args.max_capacity + " " + result.item.unit_of_measure
        };
        uiResult.details = {
          "SKU": result.item.sku_code,
          "Category": result.item.category
        };
        break;

      case 'update_item':
        uiResult.summary = `Item "${result.item.name}" Updated`;
        uiResult.details = result.details || {};
        break;

      // --- PURCHASE ORDERS ---
      case 'create_purchase_order':
        uiResult.summary = `Purchase Order #${result.po_number} Created`;
        const totalAmount = typeof result.total_amount === 'number' && !isNaN(result.total_amount)
          ? `$${result.total_amount.toFixed(2)}`
          : '$0.00';

        uiResult.impact = {
          "Total Cost": totalAmount,
          "Items Ordered": String(args.items.length),
          "Status": "Pending"
        };
        uiResult.details = {
          "Supplier": result.details?.Supplier || "Unknown",
          "Delivery": result.details?.["Expected Delivery"] || "N/A"
        };
        break;

      case 'receive_purchase_order':
        uiResult.summary = `Purchase Order Received`;
        uiResult.impact = {
          "Items Received": String(result.items_received || 0),
          "Batches Created": String(result.batches_created || 0),
          "Stock Status": "Updated"
        };
        break;

      // --- JOB ORDERS ---
      case 'create_job_order':
        uiResult.summary = `Job Order Created`;
        uiResult.impact = {
          "To Produce": `${args.quantity_to_produce} units`,
          "Ingredients": "Reserved",
          "Status": "In Progress"
        };
        uiResult.details = {
          "Product": `ID: ${args.product_id}` // ideally name, but ID is safe fallback
        };
        break;

      case 'complete_job_order':
        uiResult.summary = `Production Completed`;
        uiResult.impact = {
          "Produced": `${args.quantity_produced} units`,
          "Ingredients": "Consumed",
          "Finished Goods": "Added to Stock"
        };
        uiResult.details = {
          "Job Order": `#${args.jo_id}`
        };
        break;

      // --- STOCK MOVEMENTS ---
      case 'create_stock_adjustment':
        const qty = args.quantity > 0 ? `+${args.quantity}` : `${args.quantity}`;
        uiResult.summary = `Stock Adjustment Recorded`;
        uiResult.impact = {
          "Change": `${qty} units`,
          "Type": args.movement_type,
          "Reason": args.reason
        };
        break;

      // --- SUPPLIERS ---
      case 'create_supplier':
        uiResult.summary = `Supplier Registered`;
        uiResult.impact = {
          "Status": "Active",
          "Lead Time": `${args.lead_time || 0} days`
        };
        uiResult.details = {
          "Name": args.name,
          "Contact": args.contact_person
        };
        break;

      case 'add_supplier_item':
        uiResult.summary = `Item Linked to Supplier`;
        uiResult.impact = {
          "Price": `$${args.price_per_unit}/unit`,
          "MOQ": args.moq
        };
        break;

      // --- CSV IMPORT ---
      case 'import_csv_data':
        uiResult.summary = result.message || `Data Import Completed`;
        uiResult.impact = {
          "Imported": String(result.stats?.imported ?? 0),
          "Skipped": String(result.stats?.skipped ?? 0),
          "Errors": String(result.stats?.errors ?? 0)
        };
        uiResult.details = result.details || {};
        uiResult.related_entity = result.related_entity || null;
        break;

      // --- INVENTORY GROUPING ---
      case 'create_inventory_folder':
        uiResult.summary = `Folder "${args.name}" Created`;
        uiResult.impact = {
          "Folder Name": args.name,
          "Status": "Active"
        };
        if (args.description) {
          uiResult.details = { "Description": args.description };
        }
        break;

      case 'bulk_create_inventory_folders':
        uiResult.summary = result.message || `${result.created_count} Folders Created`;
        uiResult.impact = {
          "Created": String(result.created_count),
          "Failed": String(result.failed_count),
          "Total Requested": String(result.total_requested)
        };
        if (result.created && result.created.length > 0) {
          uiResult.details = {
            "Folders": result.created.map(f => f.name).join(', ')
          };
        }
        if (result.failed_count > 0) {
          uiResult.success = false;
          uiResult.details = {
            ...uiResult.details,
            "Failed": result.failed.map(f => `${f.name}: ${f.error}`).join('; ')
          };
        }
        break;

      case 'delete_inventory_folder':
        uiResult.summary = `Folder "${result.folder_name || args.folder_name}" Deleted`;
        uiResult.impact = {
          "Folder Name": result.folder_name || args.folder_name,
          "Items Unassigned": String(result.unassigned_count || 0),
          "Status": "Deleted"
        };
        break;

      case 'bulk_delete_inventory_folders':
        uiResult.summary = result.message || `${result.deleted_count} Folders Deleted`;
        uiResult.impact = {
          "Deleted": String(result.deleted_count),
          "Failed": String(result.failed_count),
          "Total Requested": String(result.total_requested)
        };
        if (result.deleted && result.deleted.length > 0) {
          uiResult.details = {
            "Folders": result.deleted.map(f => f.name).join(', '),
            "Total Items Unassigned": String(result.deleted.reduce((sum, f) => sum + (f.unassigned_count || 0), 0))
          };
        }
        if (result.failed_count > 0) {
          uiResult.success = false;
          uiResult.details = {
            ...uiResult.details,
            "Failed": result.failed.map(f => `${f.name}: ${f.error}`).join('; ')
          };
        }
        break;

      default:
        // Fallback for other tools: use existing details if available
        uiResult.details = result.details || args;
    }
  } catch (err) {
    logger.warn(`Failed to format UI result for ${toolName}:`, err);
    // Fallback on raw result
    uiResult.details = result;
  }

  return uiResult;
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
