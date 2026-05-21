import { normalizeConversationMessages } from './conversationUtils.js';

const buildFollowUpPrompt = ({ pendingAction, result }) =>
  `[System Notification]: The user confirmed the action "${pendingAction.description}". It was executed successfully. Result: ${JSON.stringify(result)}. Please provide a short, natural follow-up response to the user, confirming it's done and asking if they need anything else related to this. Do not repeat the technical details excessively, just be helpful.`;

export const buildAppendConfirmedActionConversationUseCase = ({
  aiConversationRepository,
  processMessage,
  logger,
  nowProvider = () => new Date()
}) => {
  return async ({ pendingAction, result, user }) => {
    let finalMessageContent = result.message;

    if (!pendingAction.conversation_id) {
      return finalMessageContent;
    }

    const conversation = await aiConversationRepository.findConversationById(pendingAction.conversation_id);
    if (!conversation) {
      return finalMessageContent;
    }

    const messages = normalizeConversationMessages(conversation.messages);

    try {
      const contextMessages = [...messages];
      const followUpResponse = await processMessage(
        buildFollowUpPrompt({ pendingAction, result }),
        contextMessages,
        user,
        pendingAction.conversation_id
      );

      if (followUpResponse && followUpResponse.content) {
        finalMessageContent = `${result.message}\n\n${followUpResponse.content}`;
      }
    } catch (aiError) {
      logger?.error?.('Error generating AI follow-up:', aiError);
    }

    messages.push({
      role: 'assistant',
      content: finalMessageContent,
      timestamp: nowProvider().toISOString(),
      action_result: result
    });

    await aiConversationRepository.updateConversation(pendingAction.conversation_id, {
      messages,
      last_message_at: nowProvider()
    });

    return finalMessageContent;
  };
};
