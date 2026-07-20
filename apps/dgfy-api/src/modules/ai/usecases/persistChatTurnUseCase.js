import { generateConversationTitle } from './conversationUtils.js';

const CONFIRMATION_ICON = '\uD83D\uDD14';

export const buildPersistChatTurnUseCase = ({
  pendingAIActionRepository,
  aiConversationRepository,
  nowProvider = () => new Date()
}) => {
  return async ({
    response,
    messagePayload,
    user,
    conversationId,
    existingTitle,
    messages
  }) => {
    const updatedMessages = [
      ...messages,
      {
        role: 'user',
        content: messagePayload,
        timestamp: nowProvider().toISOString()
      }
    ];

    let normalizedResponse = response;

    if (response.type === 'confirmation_required') {
      const confirmationMessage =
        response.ai_message || `${CONFIRMATION_ICON} I'm ready to ${response.description.toLowerCase()}. Please confirm to proceed.`;

      normalizedResponse = {
        ...response,
        message: confirmationMessage
      };

      await pendingAIActionRepository.createPendingAction({
        action_id: response.action_id,
        user_id: user.user_id,
        conversation_id: conversationId,
        action_type: response.action_type,
        action_payload: response.details || {},
        description: response.description,
        impact_summary: response.impact_summary || null,
        status: 'pending',
        expires_at: new Date(nowProvider().getTime() + 5 * 60 * 1000)
      });

      updatedMessages.push({
        role: 'assistant',
        content: `${CONFIRMATION_ICON} Confirmation required: ${response.description}`,
        timestamp: nowProvider().toISOString(),
        action_id: response.action_id
      });
    } else if (response.type === 'text') {
      const assistantMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: nowProvider().toISOString()
      };

      if (response.toolContext) {
        assistantMessage.context = response.toolContext;
      }

      updatedMessages.push(assistantMessage);
    }

    await aiConversationRepository.updateConversation(conversationId, {
      messages: updatedMessages,
      last_message_at: nowProvider(),
      title: existingTitle || generateConversationTitle(updatedMessages)
    });

    return {
      response: normalizedResponse,
      messages: updatedMessages
    };
  };
};
