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
import logger from '../../config/logger.js';
import { buildSystemPrompt, getCapabilitiesExplanation, getLimitationsExplanation } from '../../config/aiSystemPrompt.js';
import { getOpenAITools, getToolByName, toolRequiresConfirmation } from '../../config/aiTools.js';
import { resolveModelRate } from '../../config/aiModelRates.js';
import { buildContext, hasPermission, getPermissionError, hasGranularPermission, getGranularPermissionError } from '../../services/aiContextService.js';
import * as toolExecutor from '../../services/aiToolExecutor.js';
import { AiUsageLog } from '../../models/index.js';
import { buildHandleSpecialQueriesUseCase } from './usecases/handleSpecialQueriesUseCase.js';
import {
  buildHandleToolCallsUseCase,
  formatContextForMemory
} from './usecases/handleToolCallsUseCase.js';
import { buildGenerateConfirmationUseCase } from './usecases/generateConfirmationUseCase.js';
import { createLegacyConfirmedActionUiFormatter } from './usecases/legacyConfirmedActionUiFormatter.js';
import { buildExecuteConfirmedActionUseCase } from './usecases/executeConfirmedActionUseCase.js';
import { buildProcessMessageUseCase } from './usecases/processMessageUseCase.js';

// Rates moved to config/aiModelRates.js so services/menuExtractionService.js can
// share them without importing this module's entire usecase graph.

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
    const rate = resolveModelRate(model); // Falls back to the gpt-4o rate if unknown

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
 * Normalize LaTeX math delimiters to remark-math compatible format.
 * GPT-4o outputs \[...\] and \(...\) but remark-math v6 only parses $$...$$ and $...$.
 */
function normalizeLatexDelimiters(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\\\[/g, '\n$$\n')   // \[ → $$ on its own line (display math)
    .replace(/\\\]/g, '\n$$\n')   // \] → $$
    .replace(/\\\(/g, '$')        // \( → $ (inline math)
    .replace(/\\\)/g, '$');       // \) → $
}

/**
 * Generate a contextual warning message for destructive/irreversible operations.
 * Makes a separate API call with tools disabled to force a pure text warning response.
 * GPT-4o returns null content when making tool calls, so this guarantees a warning exists.
 */
async function generateDestructiveWarning(toolName, toolArgs, user, messages) {
  try {
    const warningPrompt = `The user just asked you to perform a destructive/irreversible operation: "${toolName}" with these parameters: ${JSON.stringify(toolArgs, null, 2)}.

In 2-4 sentences, explain to the user:
1. What will be permanently changed or removed (be specific — use names/IDs from the parameters)
2. That this cannot be undone once confirmed

Format using markdown. Start with ⚠️.`;

    const warningResponse = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [
        ...messages,
        { role: 'user', content: warningPrompt }
      ],
      tools: undefined,       // NO tools — force text-only response
      tool_choice: undefined,
      temperature: 0.3,       // Low temp for consistent, factual warnings
      max_tokens: 300
    });

    if (warningResponse.usage) {
      await logAiUsage(warningResponse.usage, warningResponse.model, user);
    }

    return warningResponse.choices[0].message.content || null;
  } catch (err) {
    logger.warn('generateDestructiveWarning failed, using fallback:', err.message);
    return null; // Graceful degradation — caller uses generic fallback message
  }
}

const generateConfirmation = buildGenerateConfirmationUseCase();

const handleToolCalls = buildHandleToolCallsUseCase({
  logger,
  getToolByName,
  hasPermission,
  getPermissionError,
  hasGranularPermission,
  getGranularPermissionError,
  toolRequiresConfirmation,
  generateConfirmation,
  executeTool: toolExecutor.execute,
  generateDestructiveWarning,
  createToolAwareCompletion: async ({ messages, tools, user }) => {
    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.7,
      max_tokens: 4096
    });

    if (completion.usage) {
      await logAiUsage(completion.usage, completion.model, user);
    }

    return completion.choices[0].message;
  },
  normalizeAssistantContent: normalizeLatexDelimiters
});

const formatResultForUI = createLegacyConfirmedActionUiFormatter(logger);

/**
 * Execute a confirmed action
 * @param {string} actionId - The action ID to execute
 * @param {Object} user - User executing the action
 * @returns {Promise<Object>} Execution result
 */
export const executeConfirmedAction = buildExecuteConfirmedActionUseCase({
  getToolByName,
  hasPermission,
  getPermissionError,
  hasGranularPermission,
  getGranularPermissionError,
  executeTool: toolExecutor.execute,
  logger,
  formatResultForUI,
  buildSuccessMessage: ({ uiResult, pendingAction }) =>
    `Action completed successfully: ${uiResult.summary || pendingAction.description}`,
  buildErrorMessage: ({ error }) =>
    `Failed to execute action: ${error.message}`
});

/**
 * Handle special queries about capabilities
 * @param {string} message - User message
 * @returns {Object|null} Special response or null
 */
export const handleSpecialQueries = buildHandleSpecialQueriesUseCase({
  getCapabilitiesExplanation,
  getLimitationsExplanation
});

const processMessageUseCase = buildProcessMessageUseCase({
  buildContext,
  getOpenAITools,
  buildSystemPrompt,
  formatContextForMemory,
  handleSpecialQueries,
  createChatCompletion: async ({ messages, tools, user }) => {
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

    return response;
  },
  handleToolCalls,
  normalizeAssistantContent: normalizeLatexDelimiters,
  logger,
  debugLogger: console
});

export const processMessage = async (message, conversationHistory = [], user, conversationId) =>
  processMessageUseCase(message, conversationHistory, user, conversationId);

export default {
  processMessage,
  executeConfirmedAction,
  handleSpecialQueries
};




