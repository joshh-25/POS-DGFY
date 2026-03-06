const resolveLogFunction = (target, key) => {
  if (!target || typeof target[key] !== 'function') {
    return () => {};
  }
  return target[key].bind(target);
};

export const extractTextContentFromMessage = (message) => {
  if (typeof message === 'string') {
    return message;
  }

  if (Array.isArray(message)) {
    const textPart = message.find((part) => part.type === 'text');
    return textPart ? textPart.text : '';
  }

  if (message && typeof message === 'object' && message.content) {
    return message.content;
  }

  return '';
};

export const buildProcessMessageUseCase = ({
  buildContext,
  getOpenAITools,
  buildSystemPrompt,
  formatContextForMemory,
  handleSpecialQueries,
  createChatCompletion,
  handleToolCalls,
  normalizeAssistantContent,
  logger,
  debugLogger = console
}) => {
  const logError = resolveLogFunction(logger, 'error');
  const logDebug = resolveLogFunction(debugLogger, 'log');

  return async (message, conversationHistory = [], user, conversationId) => {
    try {
      const context = await buildContext(user.user_id);
      const tools = getOpenAITools(user.role);

      logDebug('\n========== [CONTEXT DEBUG] aiService.processMessage ==========');
      logDebug(`Processing message. History has ${conversationHistory.length} messages`);
      conversationHistory.forEach((msg, idx) => {
        logDebug(
          `History[${idx}]: role=${msg.role}, hasContext=${!!msg.context}, contextKeys=${msg.context ? Object.keys(msg.context).join(',') : 'none'}`
        );
      });
      logDebug('===============================================================\n');

      const textContent = extractTextContentFromMessage(message);
      const specialResponse = handleSpecialQueries(textContent);

      if (specialResponse) {
        return {
          ...specialResponse,
          specialQuery: true,
          conversationId
        };
      }

      const messages = [
        { role: 'system', content: buildSystemPrompt(context) },
        ...conversationHistory.map((msg) => {
          if (msg.role === 'assistant' && msg.context) {
            const contextSummary = formatContextForMemory(msg.context);
            logDebug(`[CONTEXT DEBUG] APPENDING context to assistant message: ${contextSummary}`);

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
        { role: 'user', content: message }
      ];

      const response = await createChatCompletion({
        messages,
        tools,
        user
      });

      const assistantMessage = response.choices[0].message;

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        return handleToolCalls(
          assistantMessage,
          messages,
          user,
          conversationId,
          context,
          tools,
          [],
          0,
          []
        );
      }

      return {
        type: 'text',
        content: normalizeAssistantContent(assistantMessage.content),
        conversationId
      };
    } catch (error) {
      logError('AI processing error:', error);

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
};
