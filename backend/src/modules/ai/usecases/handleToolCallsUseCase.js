const extractToolContext = (results) => {
  const context = {
    items: [],
    suppliers: [],
    purchaseOrders: [],
    jobOrders: []
  };

  for (const execution of results) {
    if (execution.type !== 'result' || !execution.result) continue;

    const result = execution.result;

    if (execution.toolName === 'get_items' && result.items) {
      context.items.push(
        ...result.items.map((item) => ({
          id: item.id,
          sku_code: item.sku_code,
          name: item.name,
          category: item.category
        }))
      );
    }

    if (execution.toolName === 'get_item_details') {
      context.items.push({
        id: result.id,
        sku_code: result.sku_code,
        name: result.name,
        category: result.category,
        suppliers: result.suppliers || []
      });

      if (result.suppliers && result.suppliers.length > 0) {
        context.suppliers.push(
          ...result.suppliers.map((supplier) => ({
            id: supplier.supplier_id,
            name: supplier.name,
            price_per_unit: supplier.price_per_unit,
            moq: supplier.moq,
            for_item: result.name
          }))
        );
      }
    }

    if (execution.toolName === 'get_suppliers' && result.suppliers) {
      context.suppliers.push(
        ...result.suppliers.map((supplier) => ({
          id: supplier.id,
          name: supplier.name
        }))
      );
    }

    if (execution.toolName === 'get_supplier_details') {
      context.suppliers.push({
        id: result.supplier_id,
        name: result.name,
        items_supplied: result.items_supplied
      });
    }
  }

  const filteredContext = {};
  if (context.items.length > 0) filteredContext.items = context.items;
  if (context.suppliers.length > 0) filteredContext.suppliers = context.suppliers;

  return Object.keys(filteredContext).length > 0 ? filteredContext : null;
};

export const formatContextForMemory = (context) => {
  const parts = [];

  if (context.items && context.items.length > 0) {
    const itemSummaries = context.items.map((item) => {
      let summary = `Item "${item.name}" (ID: ${item.id}, SKU: ${item.sku_code})`;
      if (item.suppliers && item.suppliers.length > 0) {
        const supplierInfo = item.suppliers.map((supplier) =>
          `${supplier.name} (ID: ${supplier.supplier_id}, $${supplier.price_per_unit}/unit, MOQ: ${supplier.moq})`
        ).join(', ');
        summary += ` - Suppliers: ${supplierInfo}`;
      }
      return summary;
    });
    parts.push(`Items: ${itemSummaries.join('; ')}`);
  }

  if (context.suppliers && context.suppliers.length > 0) {
    const supplierSummaries = context.suppliers.map((supplier) => {
      let summary = `"${supplier.name}" (ID: ${supplier.id})`;
      if (supplier.price_per_unit) summary += ` at $${supplier.price_per_unit}/unit`;
      if (supplier.moq) summary += `, MOQ: ${supplier.moq}`;
      if (supplier.for_item) summary += ` for ${supplier.for_item}`;
      return summary;
    });
    parts.push(`Suppliers: ${supplierSummaries.join('; ')}`);
  }

  return parts.join(' | ') || 'No specific entities found';
};

export const buildHandleToolCallsUseCase = ({
  logger,
  getToolByName,
  hasPermission,
  getPermissionError,
  hasGranularPermission,
  getGranularPermissionError,
  toolRequiresConfirmation,
  generateConfirmation,
  executeTool,
  generateDestructiveWarning,
  createToolAwareCompletion,
  normalizeAssistantContent,
  maxToolIterations = 5
}) => {
  const handleToolCalls = async (
    assistantMessage,
    messages,
    user,
    conversationId,
    context,
    tools = [],
    allToolsExecuted = [],
    iteration = 0,
    allResults = []
  ) => {
    if (iteration >= maxToolIterations) {
      logger.warn(`AI reached max tool iterations (${maxToolIterations}), forcing response`);
      return {
        type: 'text',
        content: 'I gathered the information but reached my processing limit. Here is what I found so far. Please ask a follow-up question if you need more details.',
        conversationId,
        toolsExecuted: allToolsExecuted
      };
    }

    const toolCalls = assistantMessage.tool_calls || [];
    const results = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      const tool = getToolByName(toolName);

      if (tool && tool.requiredRole && !hasPermission(user.role, tool.requiredRole)) {
        results.push({
          tool_call_id: toolCall.id,
          type: 'permission_denied',
          toolName,
          message: getPermissionError(toolName.replace(/_/g, ' '), tool.requiredRole)
        });
        continue;
      }

      if (tool && tool.requiredPermission && !hasGranularPermission(user, tool.requiredPermission)) {
        results.push({
          tool_call_id: toolCall.id,
          type: 'permission_denied',
          toolName,
          message: getGranularPermissionError(toolName.replace(/_/g, ' '), tool.requiredPermission)
        });
        continue;
      }

      if (toolRequiresConfirmation(toolName)) {
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
        try {
          const result = await executeTool(toolName, toolArgs, user);
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

    const confirmationRequired = results.find((result) => result.type === 'confirmation_required');
    if (confirmationRequired) {
      const matchingCall = assistantMessage.tool_calls.find(
        (toolCall) => toolCall.function.name === confirmationRequired.toolName
      );
      const toolArgs = matchingCall ? JSON.parse(matchingCall.function.arguments || '{}') : {};

      const warningText = await generateDestructiveWarning(
        confirmationRequired.toolName,
        toolArgs,
        user,
        messages
      );

      return {
        type: 'confirmation_required',
        action_id: confirmationRequired.action_id,
        action_type: confirmationRequired.toolName,
        description: confirmationRequired.description,
        details: confirmationRequired.details,
        expires_in: 300,
        conversationId,
        ai_message: warningText
      };
    }

    const permissionDenied = results.find((result) => result.type === 'permission_denied');
    if (permissionDenied) {
      return {
        type: 'text',
        content: `Permission denied: ${permissionDenied.message}`,
        conversationId
      };
    }

    const toolResults = results.map((result) => ({
      tool_call_id: result.tool_call_id,
      role: 'tool',
      content: JSON.stringify(result.result || { error: result.message })
    }));

    const updatedMessages = [
      ...messages,
      assistantMessage,
      ...toolResults
    ];

    const currentToolsExecuted = [...allToolsExecuted, ...results.map((result) => result.toolName)];

    const finalMessage = await createToolAwareCompletion({
      messages: updatedMessages,
      tools,
      user
    });

    if (finalMessage.tool_calls && finalMessage.tool_calls.length > 0) {
      logger.info(
        `AI chaining tool calls (iteration ${iteration + 1}): ${finalMessage.tool_calls.map((toolCall) => toolCall.function.name).join(', ')}`
      );

      return handleToolCalls(
        finalMessage,
        updatedMessages,
        user,
        conversationId,
        context,
        tools,
        currentToolsExecuted,
        iteration + 1,
        [...allResults, ...results]
      );
    }

    const allAccumulatedResults = [...allResults, ...results];
    const toolContext = extractToolContext(allAccumulatedResults);

    return {
      type: 'text',
      content: normalizeAssistantContent(finalMessage.content),
      conversationId,
      toolsExecuted: currentToolsExecuted,
      toolContext
    };
  };

  return handleToolCalls;
};
