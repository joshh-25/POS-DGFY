import { normalizeConversationMessages } from './conversationUtils.js';

export const buildAppendCancelledActionConversationUseCase = ({
  aiConversationRepository,
  nowProvider = () => new Date()
}) => {
  return async ({ pendingAction, message = 'Action cancelled.' }) => {
    if (!pendingAction.conversation_id) {
      return false;
    }

    const conversation = await aiConversationRepository.findConversationById(
      pendingAction.conversation_id
    );
    if (!conversation) {
      return false;
    }

    const messages = normalizeConversationMessages(conversation.messages);
    messages.push({
      role: 'assistant',
      content: message,
      timestamp: nowProvider().toISOString()
    });

    await aiConversationRepository.updateConversation(pendingAction.conversation_id, {
      messages,
      last_message_at: nowProvider()
    });

    return true;
  };
};

